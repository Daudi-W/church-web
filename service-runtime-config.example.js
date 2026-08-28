(function (root) {
  'use strict';

  // 複製成 service-runtime-config.js，再填入接收教會自己的公開部署資料。
  // OAuth Client ID、GAS /exec 與 VAPID 公鑰會出現在瀏覽器原始碼，本來就是公開識別資料；
  // Client Secret、私鑰、白名單、Sheet ID 清單與個資不可放在這裡。
  root.MultiChurchRuntimeConfig = {
    deliveryMode: 'independent',
    environment: 'test',
    siteKey: 'your-church',
    churchId: 'your_church_id',
    churchName: '你們的教會名稱',
    googleClientId: 'YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com',
    endpoint: 'https://script.google.com/macros/s/YOUR_SERVICE_DEPLOYMENT_ID/exec',
    timezone: 'Asia/Taipei',
    features: {
      inAppNotifications: true,
      webPush: false,
      email: false,
      calendar: false
    },
    frontend: {
      platformName: '你們的教會名稱服事平台',
      scheduleUrl: 'https://docs.google.com/spreadsheets/d/YOUR_PUBLIC_SCHEDULE_SHEET_ID/edit',
      platformUrl: 'https://YOUR_SITE.pages.dev/service.html',
      defaultBranch: '本堂',
      branches: ['本堂'],
      venueEndpoint: '',
      newcomerEndpoint: '',
      vapidPublicKey: '',
      fallbackLinks: [
        { name: '場地申請', icon: 'ti-door', url: 'venue.html' },
        { name: '新人跟進', icon: 'ti-user-plus', url: 'newcomer.html' }
      ]
    }
  };
})(typeof self !== 'undefined' ? self : this);
