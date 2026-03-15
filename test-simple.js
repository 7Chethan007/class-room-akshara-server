/**
 * SIMPLE TEST: Just try to register a user
 */

const http = require('http');

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5001,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    console.log(`${method} ${path}`);
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        resolve({
          status: res.statusCode,
          data: data ? JSON.parse(data) : null,
        });
      });
    });

    req.on('error', (err) => {
      console.error('Request error:', err.message);
      reject(err);
    });

    if (body) {
      console.log('Body:', JSON.stringify(body, null, 2));
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function test() {
  console.log('Testing API...\n');
  
  try {
    const res = await makeRequest('POST', '/api/auth/register', {
      name: 'Test Teacher',
      email: `teacher-${Date.now()}@test.com`,
      password: 'testpass123',
      role: 'teacher',
    });
    
    console.log('\nResponse:', JSON.stringify(res, null, 2));
    
    process.exit(res.status === 201 ? 0 : 1);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

test();
