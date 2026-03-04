require('dotenv').config();
const mongoose = require('mongoose');
const pController = require('./src/controllers/personController');

const mockReq = { 
  params: { id: '69a6b8879955daac4cb52edb' }, 
  query: { depth: 10, includeSpouses: true, format: 'nested' }, 
  user: { role: 'admin', _id: '123' }
};

const mockRes = {
  status: function(c) { return this; },
  json: function(obj) { 
    console.log('SUCCESS keys:', Object.keys(obj));
    if (obj.root && obj.root.spouses) {
       console.log('root spouses:', obj.root.spouses.length);
    }
    process.exit(0); 
  },
  end: function() { console.log('END'); process.exit(0); }, 
  send: function(x) { 
    if (x && x.code) console.error('API ERROR RETURNED:', x.code, x.message);
    else console.log('SEND', x); 
    process.exit(1); 
  }
};

mongoose.connect(process.env.MONGO_URI).then(async () => {
  console.log('Connected DB');
  try {
    const pc = require('./src/models/PersonModel');
    const firstPerson = await pc.findOne();
    if (!firstPerson) {
       console.log('No person found to test.');
       process.exit(1);
    }
    mockReq.params.id = firstPerson._id.toString();
    console.log('Testing with root ID:', mockReq.params.id);
    
    // We override error handler inside our script
    const originalConsoleError = console.error;
    console.error = function(...args) {
        originalConsoleError('CONTROLLER LOGGED ERROR:', ...args);
    };
    
    await pController.getTree(mockReq, mockRes);
    
  } catch (e) { 
    console.error('SERVER CRASH CAUGHT:', e.stack); 
    process.exit(1); 
  }
}).catch(e => { 
  console.error('DB FAIL', e); 
  process.exit(1); 
});
