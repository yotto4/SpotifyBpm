window.onSpotifyWebPlaybackSDKReady = () => {
  'use strict';


  // ------------------------------------------------------------
  // Web Playback SDK で再生する
  // ------------------------------------------------------------
  const player = new Spotify.Player({
    name: 'BPMとメトロノームを表示するアプリ',
    getOAuthToken,
  });

  // Error handling
  player.addListener('initialization_error', ({ message }) => { console.error(message); });
  player.addListener('authentication_error', ({ message }) => { console.error(message); });
  player.addListener('account_error', ({ message }) => { console.error(message); });
  player.addListener('playback_error', ({ message }) => { console.error(message); });

  // Playback status updates
  player.addListener('player_state_changed', state => { console.log(state); });

  // Ready
  player.addListener('ready', ({ device_id }) => {
    console.log('Ready with Device ID', device_id);
  });

  // Not Ready
  player.addListener('not_ready', ({ device_id }) => {
    console.log('Device ID has gone offline', device_id);
  });

  // Connect to the player!
  player.connect();


  // ------------------------------------------------------------
  // アクセストークンを取得する
  // ------------------------------------------------------------
  // ログインボタン作成
  const params = new URLSearchParams();
  params.set('client_id', '4bfd3b99ebf2482a8696518a3ea3654a');
  params.set('response_type', 'token');
  params.set('redirect_uri', location.href);
  params.set('scope', 'streaming user-read-email user-read-private');
  const url = `https://accounts.spotify.com/authorize?${params}`;
  const login = document.getElementById('login');
  login.href = url;

  const loginDiv = document.getElementById('loginDiv');
  let tokenCallback;
  // トークンを要求されたとき
  function getOAuthToken(callback) {
    // ログインボタンを再表示する
    loginDiv.style.display = 'block';
    tokenCallback = callback;
  }

  // URLにアクセストークンがある場合、親ウィンドウに送る
  if (window.location.hash && window.opener) {
    const message = window.location.hash.slice(1);
    const targetOrigin = window.origin;
    window.opener.postMessage(message, targetOrigin);
    window.close();
  }

  let token;
  // サブウィンドウからアクセストークンを受け取る
  window.addEventListener('message', event => {
    if (event.origin !== window.origin) {
      return;
    }

    const params = new URLSearchParams(event.data);
    const accessToken = params.get('access_token');
    if (accessToken && tokenCallback) {
      token = accessToken;
      tokenCallback(accessToken);
      loginDiv.style.display = 'none';
      tokenCallback = null;
    }
  });


  // ------------------------------------------------------------
  // 現在の再生位置を計算する
  // ------------------------------------------------------------
  let lastState;
  // ステータス更新イベント
  player.addListener('player_state_changed', state => {
    lastState = state;
  });

  /** @type {HTMLInputElement} */
  const positionElm = document.getElementById('position');
  let position;
  // 毎フレーム
  window.requestAnimationFrame(updatePosition);
  function updatePosition() {
    window.requestAnimationFrame(updatePosition);

    if (!lastState) {
      // 何も再生していない場合
      return;
    }

    // 再生中の場合は最後のステータス更新からの経過時間を加算する
    position = lastState.position + (lastState.paused ? 0 : Date.now() - lastState.timestamp);

    // 再生位置を表示する
    positionElm.value = position;
    positionElm.max = lastState.duration;
  }


  // ------------------------------------------------------------
  // 再生中の曲名、アーティスト名を表示する
  // ------------------------------------------------------------
  // ステータス更新イベント
  player.addListener('player_state_changed', state => {
    if (!state) {
      // 何も再生していない場合
      return;
    }

    // 曲名、アーティスト名を表示
    const { name, artists } = state.track_window.current_track;
    const trackName = document.getElementById('trackName');
    trackName.textContent = name;
    const trackArtists = document.getElementById('trackArtists');
    trackArtists.textContent = artists.map(artist => artist.name).join(', ');
  });


  // ------------------------------------------------------------
  // 再生中の曲のオーディオ分析を取得する
  // ------------------------------------------------------------
  const audioAnalysisList = {};

  // ステータス更新イベント
  player.addListener('player_state_changed', async state => {
    if (!state) {
      // 何も再生していない場合
      return;
    }

    // 再生中の曲のidを取得する
    const { id } = state.track_window.current_track;
    if (audioAnalysisList[id]) {
      // オーディオ分析を取得済みまたは取得中の場合
      return;
    }

    // オーディオ分析を取得する
    const promise = fetch(
      `https://api.spotify.com/v1/audio-analysis/${id}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        }
      }
    );
    // オーディオ分析を取得中
    audioAnalysisList[id] = promise;
    try {
      const response = await promise;
      if (!response.ok) {
        throw response;
      }
      // オーディオ分析を取得済み
      const audioAnalysis = await response.json();
      audioAnalysisList[id] = audioAnalysis;
      console.log(audioAnalysis);
    } catch (error) {
      // オーディオ分析を未取得
      audioAnalysisList[id] = null;
      console.error(error);
    }
  });


  // ------------------------------------------------------------
  // BPMとメトロノームを表示する
  // ------------------------------------------------------------
  const beatElm = document.getElementById('beat');
  const tempoElm = document.getElementById('tempo');

  // 毎フレーム
  window.requestAnimationFrame(animationBeat);
  function animationBeat() {
    window.requestAnimationFrame(animationBeat);

    if (!lastState) {
      // 何も再生していない場合
      tempoElm.textContent = null;
      return;
    }

    // 再生中の曲のidを取得する
    const { id } = lastState.track_window.current_track;
    const audioAnalysis = audioAnalysisList[id];
    if (!audioAnalysis) {
      // オーディオ分析を取得できなかった場合
      tempoElm.textContent = '(error)';
      return;
    }
    if (audioAnalysis instanceof Promise) {
      // オーディオ分析を取得中の場合
      tempoElm.textContent = '(Loading...)';
      return;
    }

    // オーディオ分析を取得済みの場合
    const { beats, sections } = audioAnalysis;
    const sec = position / 1000;

    // ビートを表示する
    const lastBeat = findLastPosition(beats, sec);
    const scale = lastBeat
      ? Math.max(0, 1 - (sec - lastBeat.start) / 0.5)
      : 0;
    beatElm.style.transform = `scaleX(${scale})`;

    // BPMを表示する
    const lastSection = findLastPosition(sections, sec);
    const tempo = lastSection ? lastSection.tempo.toFixed(3) : null;
    tempoElm.textContent = tempo;
  }

  /**
   * @param {array} list
   * @param {number} sec
   */
  function findLastPosition(list, sec) {
    const nextIndex = list.findIndex(item => sec < item.start);
    const lastIndex = (nextIndex !== -1 ? nextIndex : list.length) - 1;
    const lastItem = list[lastIndex];
    return lastItem;
  }


  // ------------------------------------------------------------
};
