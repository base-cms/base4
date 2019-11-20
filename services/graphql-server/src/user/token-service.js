const { AuthenticationError } = require('apollo-server-express');
const jwt = require('jsonwebtoken');
const uuidv4 = require('uuid/v4');
const uuidv5 = require('uuid/v5');
const bcrypt = require('bcrypt');
const { TOKEN_SECRET, TOKEN_NAMESPACE } = require('../env');

class TokenService {
  constructor({ basedb }) {
    this.basedb = basedb;
  }

  async create(uid) {
    if (!uid) throw new Error('The user ID is required.');

    const now = new Date();
    const iat = Math.floor(now.valueOf() / 1000);

    const userSecret = await bcrypt.hash(uuidv4(), 5);
    const secret = `${userSecret}.${TOKEN_SECRET}`;

    const jti = uuidv5(`${uid}.${now.valueOf()}`, TOKEN_NAMESPACE);
    const exp = iat + Number(86400 * 30);
    const expires = new Date(exp * 1000);
    const payload = {
      jti,
      exp,
      iat,
      aud: uid,
    };
    const token = jwt.sign(payload, secret);
    await this.basedb.insertOne('platform.AuthToken', { payload, secret, expires });
    return { expires, value: token };
  }

  destroy(token) {
    return this.basedb.deleteOne('platform.AuthToken', { token });
  }

  async validate(token) {
    if (!token) throw new AuthenticationError('No token presented');
    const parsed = await jwt.decode(token, { complete: true, force: true });
    if (!parsed) throw new AuthenticationError('Invalid token');
    const { jti } = parsed.payload;
    if (!jti) throw new AuthenticationError('Invalid credentials');
    const authToken = await this.basedb.findOne('platform.AuthToken', { 'payload.jti': jti }, { projection: { secret: 1, payload: 1 } });
    if (!authToken) throw new AuthenticationError('Token does not exist');
    const { payload, secret } = authToken;
    const verified = jwt.verify(token, secret, { jwtid: payload.jti, algorithms: ['HS256'] });
    if (!verified) throw new AuthenticationError('Invalid token');
    return { token, uid: payload.aud };
  }
}

module.exports = TokenService;