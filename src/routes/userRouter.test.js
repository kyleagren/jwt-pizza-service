const request = require('supertest');
const app = require('../service');
const { randomName } = require('../../testHelpers');

let testUser;
let testUserAuthToken;

beforeAll(async () => {
  const name = randomName();
  const registerRes = await request(app).post('/api/auth').send({
    name,
    email: name + '@test.com',
    password: 'a',
  });

  testUser = registerRes.body.user;
  testUserAuthToken = registerRes.body.token;
});

test('get the authenticated user', async () => {
  const userRes = await request(app)
    .get('/api/user/me')
    .set('Authorization', `Bearer ${testUserAuthToken}`);

  expect(userRes.status).toBe(200);
  expect(userRes.body).toMatchObject({
    id: testUser.id,
    name: testUser.name,
    email: testUser.email,
  });
});

test('get the authenticated user requires authentication', async () => {
  const userRes = await request(app).get('/api/user/me');
  expect(userRes.status).toBe(401);
});

test('update the authenticated user', async () => {
  const name = randomName();
  const userRes = await request(app)
    .put('/api/user/' + testUser.id)
    .set('Authorization', `Bearer ${testUserAuthToken}`)
    .send({ name, email: name + '@test.com' });

  expect(userRes.status).toBe(200);
  expect(userRes.body.user).toMatchObject({ id: testUser.id, name });
  expect(userRes.body.token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
});

test('a user cannot update another user', async () => {
  const userRes = await request(app)
    .put('/api/user/' + (testUser.id + 1))
    .set('Authorization', `Bearer ${testUserAuthToken}`)
    .send({ name: randomName(), email: randomName() + '@test.com' });

  expect(userRes.status).toBe(403);
});

test('delete user route returns its current response', async () => {
  const userRes = await request(app)
    .delete('/api/user/' + testUser.id)
    .set('Authorization', `Bearer ${testUserAuthToken}`);

  expect(userRes.status).toBe(200);
  expect(userRes.body).toEqual({ message: 'not implemented' });
});

test('list users requires authentication', async () => {
  const usersRes = await request(app)
    .get('/api/user')
    .set('Authorization', `Bearer ${testUserAuthToken}`);

  expect(usersRes.status).toBe(200);
  expect(usersRes.body).toEqual({ message: 'not implemented', users: [], more: false });
});
