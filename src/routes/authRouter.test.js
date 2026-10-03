const request = require('supertest');
const app = require('../service');
const { randomName } = require('../../testHelpers');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;
  expectValidJwt(testUserAuthToken);
});

test('login', async () => {
  const loginRes = await request(app).put('/api/auth').send(testUser);
  expect(loginRes.status).toBe(200);
  expectValidJwt(loginRes.body.token);

  const expectedUser = { ...testUser, roles: [{ role: 'diner' }] };
  delete expectedUser.password;
  expect(loginRes.body.user).toMatchObject(expectedUser);
});

test('register', async () => {
  const userName = randomName();
  const newUser = {
    name: userName,
    email: userName + '@test.com',
    password: 'a',
  };

  const registerRes = await request(app).post('/api/auth').send(newUser);

  expect(registerRes.status).toBe(200);
  expectValidJwt(registerRes.body.token);

  expect(registerRes.body.user).toMatchObject({
    name: newUser.name,
    email: newUser.email,
    roles: [{ role: 'diner' }],
  });
});

test('register requires name, email, and password', async () => {
  const registerRes = await request(app).post('/api/auth').send({
    email: 'test@test.com',
    password: 'a',
  });

  expect(registerRes.status).toBe(400);
  expect(registerRes.body).toEqual({
    message: 'name, email, and password are required',
  });
});

test('logout', async () => {
  const logoutRes = await request(app)
    .delete('/api/auth')
    .set('Authorization', `Bearer ${testUserAuthToken}`);

  expect(logoutRes.status).toBe(200);
  expect(logoutRes.body).toEqual({
    message: 'logout successful',
  });
});

test('logout without authentication is unauthorized', async () => {
  const logoutRes = await request(app).delete('/api/auth');

  expect(logoutRes.status).toBe(401);
  expect(logoutRes.body).toEqual({
    message: 'unauthorized',
  });
});

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(
    /^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/,
  );
}
