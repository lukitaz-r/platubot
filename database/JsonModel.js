import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import crypto from 'crypto';

export const jsonModelEvents = {
  onWrite: null
};

const DATA_DIR = join(process.cwd(), 'data');

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

class JsonDocument {
  constructor(modelInfo, data) {
    this._modelInfo = modelInfo;
    Object.assign(this, data);
  }

  async save() {
    return this._modelInfo.updateDocument(this);
  }
}

export default class JsonModel {
  constructor(collectionName, schemaDefaults = {}) {
    this.collectionName = collectionName;
    this.schemaDefaults = schemaDefaults;
    this.filePath = join(DATA_DIR, `${collectionName}.json`);

    // Ensure file exists synchronously on init to avoid race conditions during boot
    import('fs').then(fs => {
      if (!fs.existsSync(this.filePath)) {
        fs.writeFileSync(this.filePath, JSON.stringify([]), 'utf8');
      }
    });
  }

  async _read() {
    try {
      const data = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(data);
      return this._normalizeData(parsed);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      console.error(`Error reading ${this.collectionName}:`, error);
      return [];
    }
  }

  _normalizeData(data) {
    if (Array.isArray(data)) {
      return data.map(item => this._normalizeData(item));
    } else if (data !== null && typeof data === 'object') {
      // MongoDB special types
      if (data.$oid) return data.$oid;
      if (data.$date) {
          // Si es un objeto de fecha de MongoDB { $date: "..." } o { $date: { $numberLong: "..." } }
          if (typeof data.$date === 'string') return data.$date;
          if (data.$date.$numberLong) return new Date(parseInt(data.$date.$numberLong)).toISOString();
          return data.$date;
      }
      if (data.$numberInt !== undefined) return parseInt(data.$numberInt);
      if (data.$numberLong !== undefined) return parseInt(data.$numberLong);

      const normalized = {};
      for (const key in data) {
        normalized[key] = this._normalizeData(data[key]);
      }
      return normalized;
    }
    return data;
  }

  async _write(data) {
    await writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf8');
    if (jsonModelEvents.onWrite) {
      try {
        jsonModelEvents.onWrite(this.collectionName);
      } catch (err) {
        console.error('Error in jsonModelEvents.onWrite:', err);
      }
    }
  }

  _wrap(doc) {
    if (!doc) return null;
    return new JsonDocument(this, doc);
  }

  _applyDefaults(data) {
    const defaultedData = { ...this.schemaDefaults, ...data };
    
    for (const key in this.schemaDefaults) {
      if (typeof this.schemaDefaults[key] === 'object' && this.schemaDefaults[key] !== null && !Array.isArray(this.schemaDefaults[key])) {
        defaultedData[key] = { ...this.schemaDefaults[key], ...(data[key] || {}) };
      }
    }
    return defaultedData;
  }

  _compareIds(id1, id2) {
    const normalize = (id) => {
      if (typeof id === 'string') return id;
      if (id && typeof id === 'object') {
        if (id.$oid) return id.$oid;
        return JSON.stringify(id);
      }
      return id;
    };
    return normalize(id1) === normalize(id2);
  }

  async updateDocument(docInstance) {
    const data = await this._read();
    const index = data.findIndex(d => this._compareIds(d._id, docInstance._id));
    const rawData = { ...docInstance };
    delete rawData._modelInfo; 

    if (index !== -1) {
      data[index] = rawData;
    } else {
      data.push(rawData);
    }
    await this._write(data);
    return docInstance;
  }

  async create(data) {
    const records = await this._read();
    
    if (Array.isArray(data)) {
       const mapped = data.map(item => {
           const withDefaults = this._applyDefaults(item);
           if (!withDefaults._id) withDefaults._id = crypto.randomUUID();
           return withDefaults;
       });
       records.push(...mapped);
       await this._write(records);
       return mapped.map(item => this._wrap(item));
    }

    const newData = this._applyDefaults(data);
    if (!newData._id) {
      newData._id = crypto.randomUUID();
    }
    
    records.push(newData);
    await this._write(records);
    return this._wrap(newData);
  }

  _getNestedValue(obj, path) {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
  }

  _match(record, query) {
    if (query.$or && Array.isArray(query.$or)) {
      return query.$or.some(subQuery => this._match(record, subQuery));
    }

    return Object.keys(query).every(key => {
      const queryVal = query[key];
      
      // Handle _id comparison specially
      if (key === '_id') return this._compareIds(record._id, queryVal);

      // Simple case: no dot notation and not an array search
      if (!key.includes('.') && record[key] === queryVal) return true;

      // Handle dot notation and array search
      const parts = key.split('.');
      let current = [record];
      
      for (const part of parts) {
        let next = [];
        for (const item of current) {
          if (item && typeof item === 'object') {
            const val = item[part];
            if (Array.isArray(val)) {
              next.push(...val);
            } else if (val !== undefined) {
              next.push(val);
            }
          }
        }
        current = next;
        if (current.length === 0) break;
      }
      
      return current.some(v => v === queryVal);
    });
  }

  async find(query = {}) {
    const records = await this._read();
    const results = records.filter(record => this._match(record, query));
    return results.map(res => this._wrap(res));
  }

  async findOne(query = {}) {
    const records = await this._read();
    const result = records.find(record => this._match(record, query));
    return this._wrap(result);
  }

  async update(query, update, options = {}) {
    const records = await this._read();
    let count = 0;
    const results = [];

    for (let i = 0; i < records.length; i++) {
      if (this._match(records[i], query)) {
        this._applyUpdate(records[i], update);
        results.push(this._wrap(records[i]));
        count++;
        if (!options.multi && count === 1) break;
      }
    }

    if (count > 0) {
      await this._write(records);
    } else if (options.upsert) {
      const newDoc = await this.create({ ...query, ...(update.$set || update) });
      return newDoc;
    }

    return options.multi ? { n: count, ok: 1 } : results[0];
  }

  _applyUpdate(record, update) {
    if (update.$set) {
      Object.assign(record, update.$set);
    }
    if (update.$inc) {
      for (const key in update.$inc) {
        record[key] = (record[key] || 0) + update.$inc[key];
      }
    }
    if (update.$push) {
      for (const key in update.$push) {
        if (!record[key]) record[key] = [];
        record[key].push(update.$push[key]);
      }
    }
    if (update.$pull) {
       for (const key in update.$pull) {
           if (Array.isArray(record[key])) {
               const query = update.$pull[key];
               record[key] = record[key].filter(item => {
                   if (typeof query === 'object') {
                       return !Object.keys(query).every(k => item[k] === query[k]);
                   }
                   return item !== query;
               });
           }
       }
    }
    if (!update.$set && !update.$inc && !update.$push && !update.$pull) {
      Object.assign(record, update);
    }
  }

  async findOneAndUpdate(query, update, options = {}) {
    return this.update(query, update, { ...options, multi: false });
  }

  async deleteOne(query) {
    const records = await this._read();
    const index = records.findIndex(record => this._match(record, query));

    if (index !== -1) {
      records.splice(index, 1);
      await this._write(records);
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  }

  async deleteMany(query) {
    const records = await this._read();
    const initialLength = records.length;
    const filtered = records.filter(record => !this._match(record, query));
    
    if (filtered.length !== initialLength) {
      await this._write(filtered);
      return { deletedCount: initialLength - filtered.length };
    }
    return { deletedCount: 0 };
  }
}
