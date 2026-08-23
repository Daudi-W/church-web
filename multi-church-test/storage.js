(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MultiChurchStorage = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SCHEMA_VERSION = 1;
  var KEY_PREFIX = 'multi-church-service:church:';
  var COLLECTIONS = ['events', 'roles', 'people', 'assignments'];
  var OPTIONAL_COLLECTIONS = ['newcomers', 'followups', 'venues', 'venueRequests'];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function assertChurchId(churchId) {
    if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(churchId || '')) {
      throw new Error('教會編號格式不正確');
    }
  }

  function validateState(churchId, state) {
    if (!state || !state.church || state.church.id !== churchId) {
      throw new Error('教會資料與目前空間不一致');
    }
    COLLECTIONS.forEach(function (collection) {
      if (!Array.isArray(state[collection])) throw new Error(collection + ' 必須是陣列');
      state[collection].forEach(function (record) {
        if (!record.id) throw new Error(collection + ' 存在沒有編號的資料');
        if (record.churchId !== churchId) throw new Error(collection + ' 存在跨教會資料');
      });
    });
    OPTIONAL_COLLECTIONS.forEach(function (collection) {
      if (state[collection] == null) return;
      if (!Array.isArray(state[collection])) throw new Error(collection + ' 必須是陣列');
      state[collection].forEach(function (record) {
        if (!record.id) throw new Error(collection + ' 存在沒有編號的資料');
        if (record.churchId !== churchId) throw new Error(collection + ' 存在跨教會資料');
      });
    });
    return true;
  }

  function keyFor(churchId) {
    assertChurchId(churchId);
    return KEY_PREFIX + churchId;
  }

  function createRepository(storage) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
      throw new Error('需要相容的儲存介面');
    }
    return {
      loadChurch: function (churchId, fallbackFactory) {
        var raw = storage.getItem(keyFor(churchId));
        if (!raw) {
          var initial = fallbackFactory();
          validateState(churchId, initial);
          this.saveChurch(churchId, initial);
          return clone(initial);
        }
        var envelope;
        try {
          envelope = JSON.parse(raw);
        } catch (error) {
          throw new Error('儲存資料無法解析，未自動覆寫');
        }
        if (envelope.schemaVersion !== SCHEMA_VERSION) {
          throw new Error('資料版本不相容，需先執行升級');
        }
        if (envelope.churchId !== churchId) throw new Error('讀取到其他教會的資料');
        validateState(churchId, envelope.data);
        return clone(envelope.data);
      },
      saveChurch: function (churchId, state) {
        validateState(churchId, state);
        var envelope = {
          schemaVersion: SCHEMA_VERSION,
          churchId: churchId,
          updatedAt: new Date().toISOString(),
          data: clone(state)
        };
        storage.setItem(keyFor(churchId), JSON.stringify(envelope));
        return envelope.updatedAt;
      },
      resetChurch: function (churchId) {
        storage.removeItem(keyFor(churchId));
      }
    };
  }

  function createId(prefix) {
    var random;
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      random = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    } else {
      random = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
    }
    return prefix + '_' + random;
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    createId: createId,
    createRepository: createRepository,
    validateState: validateState
  };
});
