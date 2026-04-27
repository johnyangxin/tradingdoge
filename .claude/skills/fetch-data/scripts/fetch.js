const axios = require('axios');

const API_BASE = 'http://localhost:3004/api';

async function fetchData() {
  console.log('Fetching latest stock data from Twelvedata...');

  try {
    const response = await axios.post(`${API_BASE}/fetch`);
    console.log(response.data);
  } catch (error) {
    console.error('Error fetching data:', error.message);
  }
}

fetchData().catch(console.error);