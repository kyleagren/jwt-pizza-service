const request = require('supertest');
const app = require('../service');
const { randomName } = require('../../testHelpers');

let testUserAuthToken;
let testUserId;

beforeAll(async () => {
  const name = randomName();
  const registerRes = await request(app).post('/api/auth').send({
    name,
    email: name + '@test.com',
    password: 'a',
  });

  testUserAuthToken = registerRes.body.token;
  testUserId = registerRes.body.user.id;
});

test('list franchises', async () => {
  const franchisesRes = await request(app).get('/api/franchise');

  expect(franchisesRes.status).toBe(200);
  expect(franchisesRes.body).toHaveProperty('franchises');
  expect(franchisesRes.body).toHaveProperty('more');
});

test('list a user\'s franchises', async () => {
  const franchisesRes = await request(app)
    .get('/api/franchise/' + testUserId)
    .set('Authorization', `Bearer ${testUserAuthToken}`);

  expect(franchisesRes.status).toBe(200);
  expect(franchisesRes.body).toEqual([]);
});

test('protected franchise routes require authentication', async () => {
  const userFranchisesRes = await request(app).get('/api/franchise/' + testUserId);
  expect(userFranchisesRes.status).toBe(401);

  const createStoreRes = await request(app).post('/api/franchise/1/store').send({ name: 'SLC' });
  expect(createStoreRes.status).toBe(401);
});

test('creating a franchise requires an admin', async () => {
  const franchiseRes = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${testUserAuthToken}`)
    .send({ name: randomName(), admins: [] });

  expect(franchiseRes.status).toBe(403);
});
