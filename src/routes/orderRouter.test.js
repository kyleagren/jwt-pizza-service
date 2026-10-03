const request = require('supertest');
const app = require('../service');
const { createAdminUser, randomName } = require('../../testHelpers');

let testUserAuthToken;

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

test('an admin can add a menu item', async () => {
  const admin = await createAdminUser();
  const adminToken = await login(admin);
  const menuItem = {
    title: randomName(),
    description: 'Just carbs',
    image: 'pizza9.png',
    price: 0.01,
  };

  const menuRes = await request(app)
    .put('/api/order/menu')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(menuItem);

  expect(menuRes.status).toBe(200);
  expect(menuRes.body).toEqual(
    expect.arrayContaining([expect.objectContaining(menuItem)]),
  );
});

test('creating an order returns the factory response', async () => {
  const { menuItem, franchise, store } = await createOrderData();
  const orderRequest = {
    franchiseId: franchise.id,
    storeId: store.id,
    items: [
      {
        menuId: menuItem.id,
        description: menuItem.description,
        price: menuItem.price,
      },
    ],
  };

  const orderRes = await request(app)
    .post('/api/order')
    .set('Authorization', `Bearer ${testUserAuthToken}`)
    .send(orderRequest);

  expect(orderRes.status).toBe(200);
  expect(orderRes.body.order).toMatchObject(orderRequest);
  expect(orderRes.body.order.id).toEqual(expect.any(Number));
  expect(orderRes.body.jwt).toEqual(expect.any(String));
});

async function login(user) {
  const loginRes = await request(app)
    .put('/api/auth')
    .send({ email: user.email, password: user.password });
  expect(loginRes.status).toBe(200);
  return loginRes.body.token;
}

async function createOrderData() {
  const admin = await createAdminUser();
  const adminToken = await login(admin);
  const menuItem = {
    title: randomName(),
    description: 'Test pizza',
    image: 'pizza1.png',
    price: 0.01,
  };
  const menuRes = await request(app)
    .put('/api/order/menu')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(menuItem);
  const savedMenuItem = menuRes.body.find(
    (item) => item.title === menuItem.title,
  );

  const franchiseRes = await request(app)
    .post('/api/franchise')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: randomName(), admins: [] });
  const franchise = franchiseRes.body;
  const storeRes = await request(app)
    .post(`/api/franchise/${franchise.id}/store`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: randomName() });

  return { menuItem: savedMenuItem, franchise, store: storeRes.body };
}
