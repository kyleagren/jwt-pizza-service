const request = require('supertest');
const app = require('../service');
const {
  randomName,
  registerUser,
  createAdminUser,
} = require('../../testHelpers');

let testUser;
let testUserAuthToken;

async function createAdminToken() {
  const admin = await createAdminUser();
  const loginRes = await request(app)
    .put('/api/auth')
    .send({ email: admin.email, password: admin.password });
  expect(loginRes.status).toBe(200);
  return loginRes.body.token;
}

beforeAll(async () => {
  const name = randomName();
  const registerRes = await request(app)
    .post('/api/auth')
    .send({
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
  expect(userRes.body.token).toMatch(
    /^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/,
  );
});

test('a user cannot update another user', async () => {
  const userRes = await request(app)
    .put('/api/user/' + (testUser.id + 1))
    .set('Authorization', `Bearer ${testUserAuthToken}`)
    .send({ name: randomName(), email: randomName() + '@test.com' });

  expect(userRes.status).toBe(403);
});

test('delete user requires authentication', async () => {
  const deleteRes = await request(app).delete('/api/user/' + testUser.id);
  expect(deleteRes.status).toBe(401);
});

test('a user can delete themselves', async () => {
  const [user, userToken] = await registerUser(request(app));

  const deleteRes = await request(app)
    .delete('/api/user/' + user.id)
    .set('Authorization', `Bearer ${userToken}`);
  expect(deleteRes.status).toBe(200);

  const loginRes = await request(app)
    .put('/api/auth')
    .send({ email: user.email, password: user.password });
  expect(loginRes.status).toBe(404);
});

test('a user cannot delete another user', async () => {
  const [otherUser] = await registerUser(request(app));

  const deleteRes = await request(app)
    .delete('/api/user/' + otherUser.id)
    .set('Authorization', `Bearer ${testUserAuthToken}`);
  expect(deleteRes.status).toBe(403);

  const loginRes = await request(app)
    .put('/api/auth')
    .send({ email: otherUser.email, password: otherUser.password });
  expect(loginRes.status).toBe(200);
});

test('an admin can delete another user', async () => {
  const [user] = await registerUser(request(app));
  const adminToken = await createAdminToken();

  const deleteRes = await request(app)
    .delete('/api/user/' + user.id)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(deleteRes.status).toBe(200);

  const loginRes = await request(app)
    .put('/api/auth')
    .send({ email: user.email, password: user.password });
  expect(loginRes.status).toBe(404);
});

test('list users unauthorized', async () => {
  const listUsersRes = await request(app).get('/api/user');
  expect(listUsersRes.status).toBe(401);
});

test('list users', async () => {
  const [user, userToken] = await registerUser(request(app));
  const listUsersRes = await request(app)
    .get('/api/user')
    .set('Authorization', 'Bearer ' + userToken);
  expect(listUsersRes.status).toBe(200);
  expect(Array.isArray(listUsersRes.body.users)).toBe(true);
  expect(listUsersRes.body.users.length).toBeGreaterThan(0);
  expect(typeof listUsersRes.body.more).toBe('boolean');

  for (const listedUser of listUsersRes.body.users) {
    expect(listedUser).toHaveProperty('id');
    expect(listedUser).toHaveProperty('name');
    expect(listedUser).toHaveProperty('email');
    expect(Array.isArray(listedUser.roles)).toBe(true);
    expect(listedUser).not.toHaveProperty('password');
  }
});

test('list users paginates', async () => {
  for (let i = 0; i < 3; i++) {
    await registerUser(request(app));
  }

  const firstPageRes = await request(app)
    .get('/api/user?page=1&limit=2')
    .set('Authorization', `Bearer ${testUserAuthToken}`);

  expect(firstPageRes.status).toBe(200);
  expect(firstPageRes.body.users.length).toBe(2);
  expect(firstPageRes.body.more).toBe(true);

  const secondPageRes = await request(app)
    .get('/api/user?page=2&limit=2')
    .set('Authorization', `Bearer ${testUserAuthToken}`);

  expect(secondPageRes.status).toBe(200);
  expect(secondPageRes.body.users.length).toBeGreaterThan(0);

  const firstPageIds = firstPageRes.body.users.map((u) => u.id);
  for (const listedUser of secondPageRes.body.users) {
    expect(firstPageIds).not.toContain(listedUser.id);
  }
});

test('list users filters by name', async () => {
  const name = randomName();
  const registerRes = await request(app)
    .post('/api/auth')
    .send({ name, email: name + '@test.com', password: 'a' });
  const filteredUser = registerRes.body.user;

  const listUsersRes = await request(app)
    .get('/api/user?name=' + name)
    .set('Authorization', `Bearer ${testUserAuthToken}`);

  expect(listUsersRes.status).toBe(200);
  expect(listUsersRes.body.users.length).toBe(1);
  expect(listUsersRes.body.users[0]).toMatchObject({
    id: filteredUser.id,
    name: filteredUser.name,
    email: filteredUser.email,
    roles: [{ role: 'diner' }],
  });
  expect(listUsersRes.body.more).toBe(false);
});

test('list users name filter supports wildcards', async () => {
  const prefix = randomName();
  const names = [prefix + 'a', prefix + 'b'];
  for (const name of names) {
    await request(app)
      .post('/api/auth')
      .send({ name, email: name + '@test.com', password: 'a' });
  }

  const listUsersRes = await request(app)
    .get('/api/user?name=' + prefix + '*')
    .set('Authorization', `Bearer ${testUserAuthToken}`);

  expect(listUsersRes.status).toBe(200);
  expect(listUsersRes.body.users.map((u) => u.name).sort()).toEqual(names);
});
