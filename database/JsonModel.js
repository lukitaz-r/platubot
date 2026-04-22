import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';

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

    if (!existsSync(this.filePath)) {
      writeFileSync(this.filePath, JSON.stringify([]), 'utf8');
    }
  }

  _read() {
    try {
      const data = readFileSync(this.filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`Error reading ${this.collectionName}:`, error);
      return [];
    }
  }

  _write(data) {
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  _wrap(doc) {
    if (!doc) return null;
    return new JsonDocument(this, doc);
  }

  _applyDefaults(data) {
    const defaultedData = { ...this.schemaDefaults, ...data };
    
    // Deep apply defaults for nested objects (very basic implementation)
    for (const key in this.schemaDefaults) {
      if (typeof this.schemaDefaults[key] === 'object' && this.schemaDefaults[key] !== null && !Array.isArray(this.schemaDefaults[key])) {
        defaultedData[key] = { ...this.schemaDefaults[key], ...(data[key] || {}) };
      }
    }
    return defaultedData;
  }

  async updateDocument(docInstance) {
    const data = this._read();
    const index = data.findIndex(d => d._id === docInstance._id);
    const rawData = { ...docInstance };
    delete rawData._modelInfo; // Don't save the circular reference

    if (index !== -1) {
      data[index] = rawData;
    } else {
      data.push(rawData);
    }
    this._write(data);
    return docInstance;
  }

  async create(data) {
    const records = this._read();
    const newData = this._applyDefaults(data);
    if (!newData._id) {
      newData._id = crypto.randomUUID();
    }
    
    // Handle array creation (Model.create([{}, {}]))
    if (Array.isArray(data)) {
       const mapped = data.map(item => {
           const withDefaults = this._applyDefaults(item);
           if (!withDefaults._id) withDefaults._id = crypto.randomUUID();
           return withDefaults;
       });
       records.push(...mapped);
       this._write(records);
       return mapped.map(item => this._wrap(item));
    }

    records.push(newData);
    this._write(records);
    return this._wrap(newData);
  }

  async find(query = {}) {
    const records = this._read();
    const results = records.filter(record => {
      return Object.keys(query).every(key => record[key] === query[key]);
    });
    return results.map(res => this._wrap(res));
  }

  async findOne(query = {}) {
    const records = this._read();
    const result = records.find(record => {
      // Very basic query matching
      return Object.keys(query).every(key => record[key] === query[key]);
    });
    return this._wrap(result);
  }

  async findOneAndUpdate(query, update, options = {}) {
    const records = this._read();
    const index = records.findIndex(record => {
      return Object.keys(query).every(key => record[key] === query[key]);
    });

    if (index !== -1) {
      // Apply updates (supports basic $set and $inc and direct object assignment)
      if (update.$set) {
        Object.assign(records[index], update.$set);
      }
      if (update.$inc) {
        for (const key in update.$inc) {
          records[index][key] = (records[index][key] || 0) + update.$inc[key];
        }
      }
      if (update.$push) {
        for (const key in update.$push) {
          if (!records[index][key]) records[index][key] = [];
          records[index][key].push(update.$push[key]);
        }
      }
      if (!update.$set && !update.$inc && !update.$push) {
        // Direct assignment like Object.assign
        Object.assign(records[index], update);
      }
      
      this._write(records);
      return this._wrap(records[index]); // Always returns new implicitly since it's local
    } else if (options.upsert) {
       // Upsert
       const newDoc = { ...query };
       if (update.$set) Object.assign(newDoc, update.$set);
       if (!update.$set && !update.$inc && !update.$push) Object.assign(newDoc, update);
       
       return this.create(newDoc);
    }
    return null;
  }

  async deleteOne(query) {
    const records = this._read();
    const index = records.findIndex(record => {
      return Object.keys(query).every(key => record[key] === query[key]);
    });

    if (index !== -1) {
      records.splice(index, 1);
      this._write(records);
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  }
}
