function SceTTS(settings) {
  settings = getValidatedSettings(settings);

  const elementId = "audioElement" + new Date().valueOf().toString();
  const audioElement = document.createElement('audio');
  audioElement.setAttribute("id", elementId);
  document.body.appendChild(audioElement);
  const audioContext = new AudioContext();
  const gainNode = audioContext.createGain();
  gainNode.connect(audioContext.destination);

  let isSpeaking = false;
  const serverUrl = settings.url;
  const sce = {
    self:this,
    playlist:[],

    // Speak
    Speak: function(obj) {
      if(isSpeaking) {
        this.playlist.push(obj);
      } else {
        say(obj).then(sayNext).catch((error)=>{
          isSpeaking = false;
          if(this.playlist.length>0) {
            say(this.playlist.shift()).then(sayNext);
          }
        });
      }
    },

    // Quit speaking, clear playlist
    ShutUp: function() {
      shutUp();
    },

    SpeakWithPromise: function(obj) {
      return say(obj);
    },

    isSpeaking: function() {
      return isSpeaking;
    },

    
  };

  function shutUp() {
    isSpeaking = false;
    audioElement.pause();
    sce.playlist = []; 
  }

  function say(obj) {
    return new Promise(function (successCallback, errorCallback) {
      isSpeaking = true;
      getAudio(obj)
        .then(playAudio)
        .then(successCallback)
        .catch(errorCallback);
    });
  }

  function sayNext() {
    const list = sce.playlist;
    if(list.length>0) {
      const obj = list.shift();
      say(obj).then(sayNext).catch((error)=>{
        isSpeaking = false;
        if(this.playlist.length>0) {
          say(this.playlist.shift()).then(sayNext);
        }
      });
    }
  }

  function getAudio(obj) {
    if(settings.cacheSpeech === false || requestSpeechFromLocalCache(obj) === null) {
      return requestSpeechFromServer(obj);
    } else {
      return requestSpeechFromLocalCache(obj);
    }
  }

  function requestSpeechFromServer(obj) {
    return new Promise(function (successCallback, errorCallback) {
      const url = `${serverUrl}/tts-server/api/infer-glowtts?text=${encodeURIComponent(obj.msg)}`;
      fetch(url, {
        mode: "cors",
        headers: {
          "Origin": "*"
        }
      })
        .then((response)=> {
          if(response.ok) {
            return response.arrayBuffer();
          } else {
            throw response.text();
          }
        })
        .then((body)=> {
          saveSpeechToLocalCache(obj.msg, body);
          successCallback({AudioStream:body,...obj});
        })
        .catch((error)=>{
          console.log(error);
          return errorCallback(error);
        })        
    })
  }

  function saveSpeechToLocalCache(message, audioStream) {

    const record = {
      Message: message,
      AudioStream: btoa((new Uint8Array(audioStream)).reduce((acc, i)=>acc+=String.fromCharCode.apply(null, [i]), ""))
    }
    let localPlaylist = JSON.parse(localStorage.getItem("sceTTSDictionary"));

    if(localPlaylist === null) {
      localPlaylist = [];
    }
    localPlaylist.push(record);
    try{
      localStorage.setItem("sceTTSDictionary", JSON.stringify(localPlaylist));
    } catch {}
  }

  function requestSpeechFromLocalCache(obj) {
    const audioDictionary = localStorage.getItem("sceTTSDictionary");
    if(audioDictionary === null) {
      return null;
    }
    const audioStreamArray = JSON.parse(audioDictionary);
    const audioStream = audioStreamArray.filter((record)=>record.Message === obj.msg)[0];;

    if(audioStream === null || typeof audioStream === "undefined") {
      return null;
    } else {
      return new Promise(function (successCallback, errorCallback) {
        successCallback({AudioStream:[...atob(audioStream.AudioStream)].map(char=>char.charCodeAt(0)),...obj});
      });
    }
  }

  function playAudio(obj) {
    return new Promise(function (success, error) {
      const uInt8Array = new Uint8Array(obj.AudioStream);
      const arrayBuffer = uInt8Array.buffer;
      audioContext.decodeAudioData(arrayBuffer, (audioBuffer)=> {
        const source = audioContext.createBufferSource();
        
        source.buffer = audioBuffer;
        source.connect(gainNode);
        source.detune.value = ((obj.pitch-1)*1000-(obj.speed-1)*1000*2)/5;
        source.playbackRate.value = obj.speed*2;
        gainNode.gain.value = settings.volume*4;
        source.addEventListener("ended", function() {
          isSpeaking = false;
          obj.onend(obj);
          success();
        });
        source.start(0);
        obj.onstart(obj);   
      });
    })
  }

  function getValidatedSettings(settings) {
    if(typeof settings === "undefined") {
      throw "Settings mush be provided to SceTTS's constructor";
    }
    if(settings.url === null || typeof settings.url === "undefined") {
      throw "A valid Server url mush be provided";
    } else {
      if(settings.url[settings.url.length-1] === "/") {
        settings.url = settings.url.slice(0, settings.url.length-1);
      }
    }
    if(typeof settings.cacheSpeech === "undefiend") {
      settings.cacheSpeech = true;
    }
    if(typeof settings.volume === "undefined") {
      settings.volume = 1.0;
    }
    return settings;
  }

  return sce;
}