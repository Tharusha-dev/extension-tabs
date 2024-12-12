import mysql from 'mysql2';

// Create a connection pool
const pool = mysql.createPool({
  host: '69.30.241.210', // Replace with your VPS IP address
  user: 'extension-user', // Replace with your MySQL username
  password: 'qKJMu7Xinhevsgw', // Replace with your MySQL password
  database: 'extension', // Name of your database
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Export the pool for use in other files
export default pool.promise();