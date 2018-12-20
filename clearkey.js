var duration = Number.MAX_SAFE_INTEGER || Number.MAX_VALUE;
var video = {
    codecs: 'avc1.4D401E',
    videoList: [
        './cmaf/init.mp4',
        './cmaf/seg-1.m4s',
        './cmaf/seg-2.m4s',
        './cmaf/seg-3.m4s',
        './cmaf/seg-4.m4s',
        './cmaf/seg-5.m4s',
        './cmaf/seg-6.m4s',
        './cmaf/seg-7.m4s',
        './cmaf/seg-8.m4s',
        './cmaf/seg-9.m4s',
        './cmaf/seg-10.m4s',
    ]
};
var audio = {
    codecs: 'mp4a.40.2',
    audioList: [
    ]
};

var clearkeySet = [{
    keyID: 'vsB5HdHtTWWRfkV6LA8Klg',
    key: 'oG2a0qdV0njImShIhbRv2A'
}];

function request(src, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', src, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function () {
        console.log('Loaded:', src);
        callback(xhr.response);
    }
    xhr.send();
}

function toJWK(keyPairs, type) {
    var i;
    var numKeys = keyPairs.length;
    var jwk = { keys: [] };

    for (i = 0; i < numKeys; i++) {
        var key = {
            kty: 'oct',
            alg: 'A128KW',
            kid: keyPairs[i].keyID,
            k: keyPairs[i].key
        };
        jwk.keys.push(key);
    }
    if (type) {
        jwk.type = type;
    }
    var jwkString = JSON.stringify(jwk);
    var len = jwkString.length;

    // Convert JSON string to ArrayBuffer
    var buf = new ArrayBuffer(len);
    var bView = new Uint8Array(buf);
    for (i = 0; i < len; i++)
        bView[i] = jwkString.charCodeAt(i);
    return buf;
}

async function getClearKey(videoElement) {
    //get key system access
    var mediaKeySystemAccess = await navigator.requestMediaKeySystemAccess('org.w3.clearkey', [{
        initDataTypes: ['cenc'],
        distinctiveIdentifier: 'optional',
        persistentState: 'optional',
        sessionTypes: ['temporary'],
        videoCapabilities: [{
            contentType: 'video/mp4;codecs="' + video.codecs + '"',
            robustness: ''
        }],
        audioCapabilities: [{
            contentType: 'audio/mp4;codecs="' + audio.codecs + '"',
            robustness: ''
        }]
    }]);

    console.log('get key system org.w3.clearkey');

    //get media keys
    var mediaKeys = await mediaKeySystemAccess.createMediaKeys();

    //attach media keys to video element
    await videoElement.setMediaKeys(mediaKeys);

    //create key session
    var mediaKeySession = mediaKeys.createSession('temporary');

    //listening key message
    mediaKeySession.addEventListener('message', (event) => {
        console.log('on keymesage', event);
        switch (event.messageType) {
            case 'license-request':
                console.log('update key start');
                mediaKeySession.update(toJWK(clearkeySet)).then(() => {
                    console.log('update key success');
                });
                break;
            case 'license-renewal':
                break;
            case 'license-release':
                break;
            case 'individualization-request':
                break;
        }
    });

    var initData = new TextEncoder().encode(JSON.stringify({
        kids: clearkeySet.map(key => {
            return key.keyID;
        })
    }));

    //generate request
    mediaKeySession.generateRequest('keyids', initData);
}

window.onload = function () {
    var mediaSource = new MediaSource();
    var videoBuffer, audioBuffer, videoEl, init = false;

    function checkInit() {
        if (init) {
            return;
        }
        if (videoEl.buffered.length) {
            videoEl.currentTime = videoEl.buffered.start(0);
            init = true;
        }
    }

    function loadVideo() {
        if (!video.videoList.length) {
            return;
        }
        var index = 0;
        videoBuffer = getSourceBuffer('video/mp4; codecs="' + video.codecs + '"');
        var loadNext = function () {
            var url = video.videoList[index];
            if (url) {
                request(url, function (buffer) {
                    index++;
                    videoBuffer.appendBuffer(buffer);
                });
            }
        };
        videoBuffer.addEventListener('updateend', function () {
            var str = 'video buffer appended:[ ';
            for (var i = 0; i < videoBuffer.buffered.length; i++) {
                str += videoBuffer.buffered.start(i) + '-' + videoBuffer.buffered.end(i) + ' ';
            }
            console.log(str + ']');
            checkInit();
            loadNext();
        }, false);
        loadNext();
    }

    function loadAudio() {
        if (!audio.audioList.length) {
            return;
        }
        var index = 0;
        audioBuffer = getSourceBuffer('audio/mp4; codecs="' + audio.codecs + '"');
        var loadNext = function () {
            var url = audio.audioList[index];
            if (url) {
                request(url, function (buffer) {
                    index++;
                    audioBuffer.appendBuffer(buffer);
                });
            }
        };
        audioBuffer.addEventListener('updateend', function () {
            var str = 'audio buffer appended:[ ';
            for (var i = 0; i < audioBuffer.buffered.length; i++) {
                str += audioBuffer.buffered.start(i) + '-' + audioBuffer.buffered.end(i) + ' ';
            }
            console.log(str + ']');
            loadNext();
        }, false);
        loadNext();
    }

    function getSourceBuffer(mimeType) {
        console.log('isTypeSupported(' + mimeType + '): ' + MediaSource.isTypeSupported(mimeType));
        console.log('video.canPlayType(' + mimeType + '): ' + videoEl.canPlayType(mimeType));
        var buffer = mediaSource.addSourceBuffer(mimeType);
        buffer.mode = 'segments';
        return buffer;
    }
    videoEl = document.querySelector('video');
    getClearKey(videoEl);
    videoEl.src = URL.createObjectURL(mediaSource);
    videoEl.addEventListener('error', function (e) {
        console.log(e.target.error);
        console.log(mediaSource.readyState);
    });
    console.log('attach source', videoEl.src);
    mediaSource.addEventListener('sourceopen', function () {
        console.log('sourceopen');
        mediaSource.duration = duration;
        loadVideo();
        loadAudio();
    });
}
