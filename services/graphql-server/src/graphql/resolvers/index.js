const deepAssign = require('deep-assign');
const GraphQLJSON = require('graphql-type-json');
const { DateType } = require('@limit0/graphql-custom-types');
const { ObjectIDType } = require('../types');

const platform = require('./platform');
const website = require('./website');

module.exports = deepAssign(
  platform,
  website,
  {
    /**
     * Custom scalar types.
     */
    Date: DateType,
    JSON: GraphQLJSON,
    ObjectID: ObjectIDType,

    /**
     * Root queries.
     */
    Query: {
      /**
       *
       */
      ping: () => 'pong',
    },
  },
);
