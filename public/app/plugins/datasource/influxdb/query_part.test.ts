import queryPart from './query_part';

describe('InfluxQueryPart', () => {
  describe('series with measurement only', () => {
    it('should handle nested function parts', () => {
      const part = queryPart.create({
        type: 'derivative',
        params: ['10s'],
      });

      expect(part.text).toBe('derivative(10s)');
      expect(part.render('mean(value)')).toBe('derivative(mean(value), 10s)');
    });

    it('should nest spread function', () => {
      const part = queryPart.create({
        type: 'spread',
      });

      expect(part.text).toBe('spread()');
      expect(part.render('value')).toBe('spread(value)');
    });

    it('should handle suffix parts', () => {
      const part = queryPart.create({
        type: 'math',
        params: ['/ 100'],
      });

      expect(part.text).toBe('math(/ 100)');
      expect(part.render('mean(value)')).toBe('mean(value) / 100');
    });

    it('should handle alias parts', () => {
      const part = queryPart.create({
        type: 'alias',
        params: ['test'],
      });

      expect(part.text).toBe('alias(test)');
      expect(part.render('mean(value)')).toBe('mean(value) AS "test"');
    });

    it('should nest distinct when count is selected', () => {
      const selectParts = [
        queryPart.create({
          type: 'field',
        }),
        queryPart.create({
          type: 'count',
        }),
      ];
      const partModel = queryPart.create({
        type: 'distinct',
      });

      queryPart.replaceAggregationAdd(selectParts, partModel);

      expect(selectParts[1].text).toBe('distinct()');
      expect(selectParts[2].text).toBe('count()');
    });

    it('should convert to count distinct when distinct is selected and count added', () => {
      const selectParts = [
        queryPart.create({
          type: 'field',
        }),
        queryPart.create({
          type: 'distinct',
        }),
      ];
      const partModel = queryPart.create({
        type: 'count',
      });

      queryPart.replaceAggregationAdd(selectParts, partModel);

      expect(selectParts[1].text).toBe('distinct()');
      expect(selectParts[2].text).toBe('count()');
    });

    it('should replace count distinct if an aggregation is selected', () => {
      const selectParts = [
        queryPart.create({
          type: 'field',
        }),
        queryPart.create({
          type: 'distinct',
        }),
        queryPart.create({
          type: 'count',
        }),
      ];
      const partModel = queryPart.create({
        type: 'mean',
      });

      queryPart.replaceAggregationAdd(selectParts, partModel);

      expect(selectParts[1].text).toBe('mean()');
      expect(selectParts).toHaveLength(2);
    });

    it('should not allowed nested counts when count distinct is selected', () => {
      const selectParts = [
        queryPart.create({
          type: 'field',
        }),
        queryPart.create({
          type: 'distinct',
        }),
        queryPart.create({
          type: 'count',
        }),
      ];
      const partModel = queryPart.create({
        type: 'count',
      });

      queryPart.replaceAggregationAdd(selectParts, partModel);

      expect(selectParts[1].text).toBe('distinct()');
      expect(selectParts[2].text).toBe('count()');
      expect(selectParts).toHaveLength(3);
    });

    it('should not remove count distinct when distinct is added', () => {
      const selectParts = [
        queryPart.create({
          type: 'field',
        }),
        queryPart.create({
          type: 'distinct',
        }),
        queryPart.create({
          type: 'count',
        }),
      ];
      const partModel = queryPart.create({
        type: 'distinct',
      });

      queryPart.replaceAggregationAdd(selectParts, partModel);

      expect(selectParts[1].text).toBe('distinct()');
      expect(selectParts[2].text).toBe('count()');
      expect(selectParts).toHaveLength(3);
    });

    it('should remove distinct when sum aggregation is selected', () => {
      const selectParts = [
        queryPart.create({
          type: 'field',
        }),
        queryPart.create({
          type: 'distinct',
        }),
      ];
      const partModel = queryPart.create({
        type: 'sum',
      });
      queryPart.replaceAggregationAdd(selectParts, partModel);

      expect(selectParts[1].text).toBe('sum()');
    });
  });
});
