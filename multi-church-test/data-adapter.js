(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MultiChurchDataAdapter = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function assertResponseChurch(churchId, response) {
    if (!response || response.churchId !== churchId) {
      throw new Error('後端回傳的教會編號不一致');
    }
  }

  function createLocalAdapter(repository, churchId) {
    return {
      kind: 'local-sandbox',
      load: async function (fallbackFactory) {
        return repository.loadChurch(churchId, fallbackFactory);
      },
      save: async function (state) {
        return { churchId: churchId, updatedAt: repository.saveChurch(churchId, state) };
      },
      reset: async function () {
        repository.resetChurch(churchId);
        return { churchId: churchId, ok: true };
      }
    };
  }

  function createAppsScriptAdapter(transport, churchId) {
    if (!transport || typeof transport.request !== 'function') {
      throw new Error('Apps Script adapter 需要 request transport');
    }
    var dataVersion = null;
    return {
      kind: 'apps-script',
      load: async function () {
        var response = await transport.request('loadChurch', {});
        assertResponseChurch(churchId, response);
        dataVersion = response.dataVersion == null ? null : response.dataVersion;
        return response.data;
      },
      save: async function (state) {
        if (!state || !state.church || state.church.id !== churchId) {
          throw new Error('拒絕送出其他教會的資料');
        }
        var response = await transport.request('saveChurch', { data: state, dataVersion: dataVersion });
        assertResponseChurch(churchId, response);
        dataVersion = response.dataVersion == null ? dataVersion : response.dataVersion;
        return response;
      },
      reset: async function () {
        throw new Error('正式後端不提供從前端重設教會資料');
      }
    };
  }

  return {
    createAppsScriptAdapter: createAppsScriptAdapter,
    createLocalAdapter: createLocalAdapter
  };
});
