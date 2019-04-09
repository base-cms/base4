const moment = require('moment');
const { BaseDB, MongoDB } = require('@base-cms/db');
const { TENANT_KEY, MONGO_DSN } = require('../env');

const { Client } = MongoDB;

const basedb = new BaseDB({
  tenant: TENANT_KEY,
  client: new Client(MONGO_DSN, { useNewUrlParser: true }),
});

const statusCriteria = () => {
  const date = new Date();
  return {
    status: 1,
    published: { $lte: date },
    $or: [
      { unpublished: { $exists: false } },
      { unpublished: { $gte: date } },
    ],
  };
};

module.exports = {
  getContent: (type, skip) => {
    const query = {
      ...statusCriteria(),
      type,
    };
    const options = {
      limit: 10000,
      projection: {
        'mutations.Website.alias': 1,
        'mutations.Website.primarySection': 1,
        'mutations.Website.slug': 1,
        type: 1,
        updated: 1,
      },
      skip,
    };
    // @todo need canonicalPath stuff from gql-server so these don't 301.
    return basedb.find('platform.Content', query, options);
  },
  getSections: () => {
    const options = {
      projection: { alias: 1 },
      sort: { sequence: 1 },
    };
    return basedb.find('website.Section', { status: 1 }, options);
  },
  getContentCounts: () => {
    const pipeline = [
      { $match: statusCriteria() },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ];
    return basedb.aggregate('platform.Content', pipeline);
  },
  getPrimarySections: (ids) => {
    const query = {
      _id: { $in: ids },
      status: 1,
    };
    const options = {
      projection: { alias: 1 },
    };
    return basedb.find('website.Section', query, options);
  },
  getLatestNews: () => {
    const published = new Date(moment().subtract(5, 'days').valueOf());
    const query = {
      ...statusCriteria(),
      type: { $in: ['News', 'PressRelease', 'Blog'] },
      $and: [
        { published: { $gte: published } },
      ],
    };
    const options = {
      limit: 1000,
      projection: {
        'mutations.Website.primarySection': 1,
        'mutations.Website.slug': 1,
        type: 1,
        published: 1,
        name: 1,
      },
      sort: { published: -1 },
    };
    return basedb.find('platform.Content', query, options);
  },
};
