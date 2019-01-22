const { UserInputError } = require('apollo-server-express');
const { underscore, dasherize, titleize } = require('inflection');
const pathResolvers = require('../../utils/content-path-resolvers');
const { createTitle, createDescription } = require('../../utils/content');
const defaultContentTypes = require('../../utils/content-types');
const getDescendantIds = require('../../utils/website-section-child-ids');
const getDefaultOption = require('../../utils/get-default-option');
const connectionProjection = require('../../utils/connection-projection');

const { isArray } = Array;

const resolveType = ({ type }) => `Content${type}`;

module.exports = {
  Addressable: { __resolveType: resolveType },
  Authorable: { __resolveType: resolveType },
  Contactable: { __resolveType: resolveType },
  Media: { __resolveType: resolveType },

  /**
   *
   */
  Content: {
    __resolveType: resolveType,

    canonicalPath: async (content, _, ctx) => {
      const { contentPaths } = ctx;
      if (!contentPaths.includes('id')) {
        throw new UserInputError('The canonicalPath arguments must at least contain "id"', {
          invalidArgs: contentPaths,
        });
      }
      const { type, linkUrl } = content;
      const types = ['Promotion', 'TextAd'];
      if (types.includes(type) && linkUrl) return linkUrl;

      const values = await Promise.all(contentPaths.map((key) => {
        const fn = pathResolvers[key];
        return typeof fn === 'function' ? fn(content, ctx) : content[key];
      }));

      const path = values.filter(v => v).join('/');
      if (!path) return '';
      return `/${path}`;
    },

    /**
     * Return title and description as functions, so they're only
     * executed when requested.
     */
    metadata: content => ({
      title: () => createTitle(content),
      description: () => createDescription(content),
    }),

    redirectTo: (content) => {
      const { type, linkUrl } = content;

      const types = ['Promotion', 'TextAd'];
      if (!types.includes(type)) return null;

      return linkUrl;
    },

    type: ({ type }, { input }) => {
      const { format } = input;
      switch (format) {
        case 'dasherize':
          return dasherize(underscore(type));
        case 'underscore':
          return underscore(type);
        case 'titleize':
          return titleize(underscore(type));
        default:
          return type;
      }
    },

    statusText: ({ status, published, unpublished }) => {
      const now = Date.now();
      switch (status) {
        case 0:
          return 'Deleted';
        case 1:
          if (published && published.valueOf() > now) return 'Scheduled';
          if (unpublished && unpublished < now) return 'Expired';
          if (published) return 'Published';
          return 'Unpublished';
        case 2:
          return 'Draft';
        default:
          return 'Unpublished';
      }
    },
  },

  /**
   *
   */
  Query: {
    /**
     *
     */
    allPublishedContent: async (_, { input }, { basedb }, info) => {
      const {
        since,
        sectionId,
        contentTypes,
        requiresImage,
        sectionBubbling,
        sort,
        pagination,
      } = input;

      const date = since || new Date();
      const query = {
        status: 1,
        type: { $in: contentTypes.length ? contentTypes : defaultContentTypes },
        published: { $lte: date },
        $or: [
          { unpublished: { $gte: date } },
          { unpublished: { $exists: false } },
        ],
      };

      if (requiresImage) {
        query.primaryImage = { $exists: true };
      }

      let sectionIds = sectionId;
      if (sectionId && sectionBubbling) {
        const descendantIds = await getDescendantIds(sectionId, basedb);
        if (descendantIds.length) {
          sectionIds = { $in: descendantIds };
        }
      }
      if (sectionIds) {
        query['mutations.Website.primarySection.$id'] = sectionIds;
      }

      const projection = connectionProjection(info);
      return basedb.paginate('platform.Content', {
        query,
        sort,
        projection,
        ...pagination,
      });
    },

    /**
     *
     */
    websiteScheduledContent: async (_, { input }, { basedb }, info) => {
      const {
        sectionId,
        optionId,
        excludeContentIds,
        excludeSectionIds,
        includeContentTypes,
        excludeContentTypes,
        requiresImage,
        sectionBubbling,
        pagination,
      } = input;

      const [descendantIds, defaultOption] = await Promise.all([
        sectionBubbling ? getDescendantIds(sectionId, basedb) : Promise.resolve([]),
        !optionId ? getDefaultOption(basedb) : Promise.resolve(null),
      ]);

      const now = new Date();
      const $elemMatch = {
        sectionId: descendantIds.length ? { $in: descendantIds } : sectionId,
        optionId: defaultOption ? defaultOption._id : optionId,
        start: { $lte: now },
        $and: [
          {
            $or: [
              { end: { $gt: now } },
              { end: { $exists: false } },
            ],
          },
        ],
      };

      if (excludeSectionIds.length) {
        $elemMatch.$and.push({ sectionId: { $nin: excludeSectionIds } });
      }
      const query = { sectionQuery: { $elemMatch } };
      if (requiresImage) {
        query.primaryImage = { $exists: true };
      }
      if (includeContentTypes.length) {
        if (!isArray(query.$and)) query.$and = [];
        query.$and.push({ type: { $in: includeContentTypes } });
      }
      if (excludeContentTypes.length) {
        if (!isArray(query.$and)) query.$and = [];
        query.$and.push({ type: { $nin: excludeContentTypes } });
      }
      if (excludeContentIds.length) {
        query._id = { $nin: excludeContentIds };
      }

      const projection = connectionProjection(info);
      return basedb.paginate('platform.Content', {
        query,
        sort: { field: 'sectionQuery.start', order: 'desc' },
        projection: { 'sectionQuery.$.start': 1, ...projection },
        excludeProjection: ['sectionQuery.start'],
        ...pagination,
      });
    },
  },
};
