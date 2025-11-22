const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('Node is reachable!'));

app.listen(5430, '127.0.0.1', () =>
  console.log('🚀 Test server running')
);
