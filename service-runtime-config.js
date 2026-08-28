(function (root) {
  'use strict';

  // 這個檔案只放「這次部署連到哪裡」的公開設定，不放密碼、白名單或個資。
  // 合作教會部署時只需替換這一份；其餘前台程式維持共用。
  root.MultiChurchRuntimeConfig = {
    deliveryMode: 'independent',
    environment: 'production',
    siteKey: 'taoyuan',
    churchId: 'taoyuan_church',
    churchName: '桃園教會',
    googleClientId: '1074124628352-lvvlgdr0vm4u35u48htt0ctg18n6ciju.apps.googleusercontent.com',
    endpoint: 'https://script.google.com/macros/s/AKfycbxavwu853Lejoco68BOJ1hEiH6MSrXMe2do171i8uUbGtQxDYBrLqk5U07H6Qas96rAWQ/exec',
    timezone: 'Asia/Taipei',
    features: {
      inAppNotifications: true,
      webPush: true,
      email: false,
      calendar: true
    },
    frontend: {
      platformName: '桃園教會服事平台',
      scheduleUrl: 'https://docs.google.com/spreadsheets/d/1XAtW7ns2r4bc6uq-CqylVYIAY1qVTbdbJvygFUjzvu0/edit?usp=sharing',
      platformUrl: 'https://daudi-w.github.io/church-web/service.html',
      defaultBranch: '桃園',
      branches: ['桃園', '林口'],
      venueEndpoint: 'https://script.google.com/macros/s/AKfycbxqvS2gLPqkXOgCWV-130JO9cC6Oi9pvCkVf28jRMynqW1mdWyP_00J8HGu0VY3HXDT2A/exec',
      newcomerEndpoint: 'https://script.google.com/macros/s/AKfycbwAc05-vf-HfZ0VcaPaFeVo3a3nGoyZT4lgkg-7hFFEXa3J09JDHnnGVIty9eXXSaNa/exec',
      vapidPublicKey: 'BM8nIgdXT6ab7HUW1-BRiwjPOdOYHvr5GslQxVmCn7dcTxYAybHPLTp_WPUddMmOaUXDeArnYXRHMJ6bpMpJN7E',
      fallbackLinks: [
        { name: '歌詞 PPT 系統', icon: 'ti-presentation', url: 'https://worshiplyrics.onrender.com' },
        { name: '節拍器疊片', icon: 'ti-music', url: 'https://daudi-w.github.io/metronome-tool/' },
        { name: '即時問答', icon: 'ti-bulb', url: 'https://church-quiz-26060378.web.app' },
        { name: '場地申請', icon: 'ti-door', url: 'venue.html' },
        { name: '新人跟進', icon: 'ti-user-plus', url: 'newcomer.html' }
      ]
    }
  };
})(typeof self !== 'undefined' ? self : this);
