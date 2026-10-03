const request = require('supertest');
const app = require('../service');
const { randomName } = require('../../testHelpers');

let testUserAuthToken;

beforeAll(async () => {
  const name = randomName();
  const registerRes = await request(app).post('/api/auth').send({
    name,
    email: name + '@test.com',
    password: 'a',
  });

  testUserAuthToken = registerRes.body.token;
});

test('get the menu', async () => {
  const menuRes = await request(app).get('/api/order/menu');

  expect(menuRes.status).toBe(200);
  expect(Array.isArray(menuRes.body)).toBe(true);
});

test('get orders requires authentication', async () => {
  const ordersRes = await request(app).get('/api/order');
  expect(ordersRes.status).toBe(401);
});

test('get orders for the authenticated user', async () => {
  const ordersRes = await request(app)
    .get('/api/order')
    .set('Authorization', `Bearer ${testUserAuthToken}`);

  expect(ordersRes.status).toBe(200);
  expect(ordersRes.body).toHaveProperty('dinerId');
  expect(ordersRes.body).toHaveProperty('orders');
  expect(ordersRes.body).toHaveProperty('page');
});

test('only an admin can add a menu item', async () => {
  const menuRes = await request(app)
    .put('/api/order/menu')
    .set('Authorization', `Bearer ${testUserAuthToken}`)
    .send({ title: 'Student' });

  expect(menuRes.status).toBe(403);
});
