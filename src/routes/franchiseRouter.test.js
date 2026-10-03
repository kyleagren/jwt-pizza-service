const request = require('supertest');
const app = require('../service');
const { createAdminUser, randomName } = require('../../testHelpers');

let testUserAuthToken;
let testUserId;
let testUserEmail;

beforeAll(async () => {
  const name = randomName();
  const registerRes = await request(app)
    .post('/api/auth')
    .send({
      name,
      email: name + '@test.com',
      password: 'a',
    });

  testUserAuthToken = registerRes.body.token;
  testUserId = registerRes.body.user.id;
  testUserEmail = registerRes.body.user.email;
});

test('list franchises', async () => {
  const franchisesRes = await request(app).get('/api/franchise');

  expect(franchisesRes.status).toBe(200);
  expect(franchisesRes.body).toHaveProperty('franchises');
  expect(franchisesRes.body).toHaveProperty('more');
});

test("list a user's franchises", async () => {
  const franchisesRes = await request(app)
    .get('/api/franchise/' + testUserId)
    .set('Authorization', `Bearer ${testUserAuthToken}`);

  expect(franchisesRes.status).toBe(200);
  expect(franchisesRes.body).toEqual([]);
});

test('protected franchise routes require authentication', async () => {
  const userFranchisesRes = await request(app).get(
    '/api/franchise/' + testUserId,
  );
  expect(userFranchisesRes.status).toBe(401);

  const createStoreRes = await request(app)
    .post('/api/franchise/1/store')
    .send({ name: 'SLC' });
  expect(createStoreRes.status).toBe(401);
});

test('creating a franchise requires an admin', async () => {
  const franchiseRes = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${testUserAuthToken}`)
    .send({ name: randomName(), admins: [] });

  expect(franchiseRes.status).toBe(403);
});

test('an admin can create a franchise', async () => {
  const adminToken = await createAdminToken();
  const franchise = { name: randomName(), admins: [] };

  const franchiseRes = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(franchise);

  expect(franchiseRes.status).toBe(200);
  expect(franchiseRes.body).toMatchObject(franchise);
  expect(franchiseRes.body.id).toEqual(expect.any(Number));
});

test('an authorized franchise admin can create and delete a store', async () => {
  const adminToken = await createAdminToken();
  const franchiseRes = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: randomName(), admins: [{ email: testUserEmail }] });
  const franchise = franchiseRes.body;

  const createStoreRes = await request(app)
    .post(`/api/franchise/${franchise.id}/store`)
    .set('Authorization', `Bearer ${testUserAuthToken}`)
    .send({ name: randomName() });

  expect(createStoreRes.status).toBe(200);
  expect(createStoreRes.body).toMatchObject({ franchiseId: franchise.id });
  expect(createStoreRes.body.id).toEqual(expect.any(Number));

  const deleteStoreRes = await request(app)
    .delete(`/api/franchise/${franchise.id}/store/${createStoreRes.body.id}`)
    .set('Authorization', `Bearer ${testUserAuthToken}`);

  expect(deleteStoreRes.status).toBe(200);
  expect(deleteStoreRes.body).toEqual({ message: 'store deleted' });
});

test('deleting a franchise calls the database', async () => {
  const adminToken = await createAdminToken();
  const createdFranchiseRes = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: randomName(), admins: [] });

  const franchiseRes = await request(app).delete(
    `/api/franchise/${createdFranchiseRes.body.id}`,
  );

  expect(franchiseRes.status).toBe(200);
  expect(franchiseRes.body).toEqual({ message: 'franchise deleted' });
});

async function createAdminToken() {
  const admin = await createAdminUser();
  const loginRes = await request(app)
    .put('/api/auth')
    .send({ email: admin.email, password: admin.password });
  expect(loginRes.status).toBe(200);
  return loginRes.body.token;
}
