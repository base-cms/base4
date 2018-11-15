const { Router } = require('express');
const { ApolloServer } = require('apollo-server-express');
const { schema } = require('@base-cms/graphql');
const db = require('../db');

const { NODE_ENV } = process.env;
const isProduction = NODE_ENV === 'production';

const router = Router();

const getCanonicalPaths = (req) => {
  const header = req.get('x-content-canonical-paths');
  if (!header) return ['sectionAlias', 'type', 'id', 'slug'];
  return header.split(',');
};

const server = new ApolloServer({
  schema,
  playground: !isProduction ? { endpoint: '/graphql' } : false,
  introspection: true,
  context: ({ req }) => {
    const tenant = req.get('x-tenant-key');
    // @todo make this more elegant with data loaders, etc.
    const proxy = () => ({
      call: (action, params, ...rest) => db.call(action, { tenant, ...params }, ...rest),
      tenant: () => tenant,
    });
    return { db: proxy(), contentPaths: getCanonicalPaths(req) };
  },
});
server.applyMiddleware({ app: router, path: '/' });

module.exports = router;
