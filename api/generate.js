const readingSchema = {
  type: 'object',
  properties: {
    title: {
      type: 'string'
    },

    readingTimeMinutes: {
      type: 'integer',
      minimum: 1,
      maximum: 30
    },

    sections: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          heading: {
            type: 'string'
          },
          content: {
            type: 'string'
          }
        },
        required: ['heading', 'content']
      }
    },

    vocabularyList: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          word: {
            type: 'string'
          },
          definition: {
            type: 'string'
          }
        },
        required: ['word', 'definition']
      }
    },

    comprehensionQuestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: [
              'literal',
              'inferential',
              'vocabulary',
              'author purpose',
              'evaluative',
              'summarising'
            ]
          },
          question: {
            type: 'string'
          }
        },
        required: ['type', 'question']
      }
    }
  },

  required: [
    'title',
    'readingTimeMinutes',
    'sections',
    'vocabularyList',
    'comprehensionQuestions'
  ]
};
