import { startRegistration, loginUser } from '../src/app/actions/auth';
import dotenv from 'dotenv';
dotenv.config();

async function testAuth() {
  console.log('Testing Registration...');
  const regRes = await startRegistration('test2@catest.app', 'securepassword');
  console.log('Register Result:', regRes);

  console.log('Testing Login...');
  const loginRes = await loginUser('test2@catest.app', 'securepassword');
  console.log('Login Result:', loginRes);

  console.log('Testing Invalid Login...');
  const invalidRes = await loginUser('test2@catest.app', 'wrongpassword');
  console.log('Invalid Login Result:', invalidRes);
}

testAuth().catch(console.error);
