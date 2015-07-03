'use strict';

var localVideo = document.querySelector('video#localVideo');

var sendButton = document.getElementById("sendButton");
var sendTextarea = document.getElementById("dataChannelSend");
var receiveTextarea = document.getElementById("dataChannelReceive");


var fileInput = document.querySelector('input#fileInput');
var downloadDiv = document.querySelector('a#received');
var sendProgress = document.querySelector('progress#sendProgress');
var receiveProgress = document.querySelector('progress#receiveProgress');

var receiveBuffer = [];
var receivedSize = 0;
var filesize = 0;

var bytesPrev = 0;
var timestampPrev = 0;
var timestampStart;
var videoConstrain = true;
var retry = true;

var pc_constraints = {
        'optional': [
          {'DtlsSrtpKeyAgreement': true},
          {'RtpDataChannels': true}
        ]};

fileInput.addEventListener('change', createFileChannel, false);



sendButton.onclick = sendData;
var labelId = 0;

var localStream;
var connections = {};
var datachannels = {};
var filesize = {};
var fileName = {};

var room = '/server/1';
var mediaConstraints = {
    'mandatory' : {
      'OfferToReceiveAudio' : true,
      'OfferToReceiveVideo' : true
    }
  };
var localDescription;
var servers = null;

var socket = new WebSocket('ws://' + window.location.host + room);

socket.onmessage = function(message) {
  var msg = JSON.parse(message.data);

  switch (msg.type) {
  case 'assigned_id':
    socket.id = msg.id;
    socket.sessionId = msg.sessionId;

    trace("sessionId : " + socket.sessionId);
    break;
  case 'received_offer':
    console.log('received offer', msg.data);
    var sessionId = msg.sessionId;
    if(null == connections[sessionId]) {
      console.log('received offer ,connection is null ,prepare to create connection for session : ' + sessionId)
      connections[sessionId] = createConnection(sessionId);
      if (null != localStream) {
        connections[sessionId].addStream(localStream);
        trace("Added localStream to PeerConnection");
      }
    }

    connections[sessionId].setRemoteDescription(new RTCSessionDescription(msg.data));
    connections[sessionId].createAnswer(function(description) {
      console.log('sending answer');
//      setLocalSessionDescription(connections[sessionId],description);
      connections[sessionId].setLocalDescription(description);
      socket.send(JSON.stringify({
        type : 'received_answer',
        data : description,
        sessionId : socket.sessionId,
        peerSessionId : sessionId
      }));
    }, handleError, mediaConstraints);
    getVideoElement(sessionId);
    break;
  case 'received_answer':
    console.log('received answer from ' + msg.sessionId);
    var sessionId = msg.sessionId;
    if(connections[sessionId]!= null ) {
      console.log('00 connection not null');
    }
    console.log('msg.data ' + msg.data);
    if(socket.sessionId != sessionId) {
      connections[sessionId].setRemoteDescription(new RTCSessionDescription(msg.data));
    }
    break;
  case 'received_candidate':
    console.log('received candidate from session ' + msg.sessionId);
    var candidate = new RTCIceCandidate({
      sdpMLineIndex : msg.data.label,
      candidate : msg.data.candidate
    });
    var sessionId = msg.sessionId;
    if(null == connections[sessionId]) {
      trace("connection is null, prepare to create connection for sessionId " + sessionId);
      connections[sessionId] = createConnection(sessionId);
      if(null != localStream) {
          connections[sessionId].addStream(localStream);
          trace("Added localStream to localPeerConnection");
        }
      getVideoElement(sessionId);
    } else {
       trace("connection not null ");
    }
    connections[sessionId].addIceCandidate(candidate);
    break;

  case 'send_file':
    var sessionId = msg.sessionId;
    filesize[sessionId] = msg.fileSize;
    fileName[sessionId] = msg.fileName;
    break;
  case 'query_peer':
    console.log("received query_peer");
    var peerSessionIds = msg.peerSessionIds;
    console.log(peerSessionIds);

    if(peerSessionIds) {
      var peerSessionIdArray= new Array();
      peerSessionIdArray=peerSessionIds.split(",");
      for (var i=0;i<peerSessionIdArray.length ;i++ )
      {
        var peerId = peerSessionIdArray[i];
        console.log(peerId);
        console.log('query peer prepare to create connection for session id : ' + peerSessionIdArray[i]);
        var currentConnection = createConnection(peerSessionIdArray[i]);
        connections[peerSessionIdArray[i]] = currentConnection;
        if(null != localStream) {
           currentConnection.addStream(localStream);
           trace("Added localStream to Connection");
        }
        getVideoElement(peerSessionIdArray[i]);
        createOffer(currentConnection,peerId);
      }

    }
    break;
  case 'connection_closed':
    console.log('peer ' + msg.peer + ' closed connection');
    var closedPeerVideo = document.getElementById(msg.peer);
    var remoteVideo = document.getElementById("remoteVideo");
    if(closedPeerVideo) {
      console.log('remove remote video');
      remoteVideo.removeChild(closedPeerVideo);
    }
    break;
  }
};

function createOffer(currentConnection,peerId) {
  currentConnection.createOffer(function(description) {
//    setLocalSessionDescription(currentConnection,description);
        currentConnection.setLocalDescription(description);
        socket.send(JSON.stringify({
        type : 'received_offer',
        data : description,
        sessionId : socket.sessionId,
        peerSessionId : peerId
          }));
        },handleError,mediaConstraints);
}

function setLocalSessionDescription(peerConnection,sessionDescription) {
    // Set Opus as the preferred codec in SDP if Opus is present.
    sessionDescription.sdp = preferOpus(sessionDescription.sdp);
    peerConnection.setLocalDescription(sessionDescription);
  }


function createConnection(sessionId) {
  console.log('create connection ' + sessionId);
  var peerConnection  = new RTCPeerConnection(servers);
  peerConnection.onicecandidate = function(e){
    trace("got local ice candidate");
      if (e.candidate) {
      console.log('sending received candidate');
      socket.send(JSON.stringify({
        type : 'received_candidate',
        sessionId : socket.sessionId,
        peerSessionId : sessionId,
//	      candidate : e.candidate
        data : {
          label : e.candidate.sdpMLineIndex,
          id : e.candidate.sdpMid,
          candidate : e.candidate.candidate
        }
      }));
    }
    }
  peerConnection.onaddstream = function(e) {
    var remoteVideo = getVideoElement(sessionId)
    attachMediaStream(remoteVideo, e.stream);
    trace("Received remote stream");
  };
  var sendChannel = peerConnection.createDataChannel("",{reliable: false});
  datachannels[sessionId] = sendChannel;
//  sendChannel.onmessage = handleMessage;
  sendChannel.onopen = function() {
    var readyState = sendChannel.readyState;
    trace('Send channel state is: ' + readyState);
    enableMessageInterface(readyState == "open");
  };
  sendChannel.onclose = function() {
    var readyState = sendChannel.readyState;
    trace('Send channel state is: ' + readyState);
    enableMessageInterface(readyState == "open");
  };

  peerConnection.ondatachannel = function(event){
    trace('Receive Channel Callback');
      var receiveChannel = event.channel;
      if(receiveChannel.label == 'sendFileDataChannel') {
        receiveChannel.binaryType = 'arraybuffer';
        receiveChannel.onmessage = function(event){
          console.log('receive file chunk ');
            receiveBuffer.push(event.data);
            receivedSize += event.data.byteLength;

            receiveProgress.value = receivedSize;
            console.log('received size ' + receivedSize);
            console.log('filesize ' + filesize[sessionId]);

            // we are assuming that our signaling protocol told
            // about the expected file size (and name, hash, etc).
            if (receivedSize  == filesize[sessionId]) {
              console.log('finished the received process');
              var received = new window.Blob(receiveBuffer);
              receiveBuffer = [];

              downloadDiv.href = URL.createObjectURL(received);
              downloadDiv.download = fileName[sessionId];
              var text = 'Click to download \'' + fileName[sessionId] + '\' (' + filesize[sessionId] +
                  ' bytes)';
              downloadDiv.appendChild(document.createTextNode(text));
              downloadDiv.style.display = 'block';
            }

        };
        receiveChannel.onopen = handleReceiveChannelStateChange(receiveChannel);;
        receiveChannel.onclose = handleReceiveChannelStateChange(receiveChannel);;

        receivedSize = 0;
        downloadDiv.innerHTML = '';
        downloadDiv.removeAttribute('download');
        if (downloadDiv.href) {
          URL.revokeObjectURL(downloadDiv.href);
          downloadDiv.removeAttribute('href');
        }
      } else {
        receiveChannel.onmessage = function(event) {
            trace('Received message: ' + event.data);
            var newLine = document.createElement('label');
            newLine.id =labelId;
            labelId +=1;
            newLine.innerHTML = sessionId + ': ' +event.data + '\n';
            receiveTextarea.appendChild(newLine);
          };
        receiveChannel.onopen = handleReceiveChannelStateChange(receiveChannel);
        receiveChannel.onclose = handleReceiveChannelStateChange(receiveChannel);
      }
  };
  return peerConnection
}

function enableMessageInterface(shouldEnable) {
    if (shouldEnable) {
    dataChannelSend.disabled = false;
    dataChannelSend.focus();
    dataChannelSend.placeholder = "";
    sendButton.disabled = false;
  } else {
    dataChannelSend.disabled = true;
    sendButton.disabled = true;
  }
}

function handleMessage(event) {
    trace('Received message: ' + event.data);
    var newLine = document.createElement('label');
    newLine.id =labelId;
    labelId +=1;
    newLine.innerHTML = event.data + '\n';
    receiveTextarea.appendChild(newLine);
  }


function gotReceiveChannel(event) {
    trace('Receive Channel Callback');
    var receiveChannel = event.channel;
    if(receiveChannel.label == 'sendFileDataChannel') {
      receiveChannel.binaryType = 'arraybuffer';
      receiveChannel.onmessage = onReceiveMessageCallback;
      receiveChannel.onopen = handleReceiveChannelStateChange(receiveChannel);;
      receiveChannel.onclose = handleReceiveChannelStateChange(receiveChannel);;

      receivedSize = 0;
      downloadDiv.innerHTML = '';
      downloadDiv.removeAttribute('download');
      if (downloadDiv.href) {
        URL.revokeObjectURL(downloadDiv.href);
        downloadDiv.removeAttribute('href');
      }
    } else {
      receiveChannel.onmessage = handleMessage;
      receiveChannel.onopen = handleReceiveChannelStateChange(receiveChannel);
      receiveChannel.onclose = handleReceiveChannelStateChange(receiveChannel);
    }


  }


function onReceiveMessageCallback(event) {
    //trace('Received Message ' + event.data.byteLength);
    receiveBuffer.push(event.data);
    receivedSize += event.data.byteLength;

    receiveProgress.value = receivedSize;

    // we are assuming that our signaling protocol told
    // about the expected file size (and name, hash, etc).
    if (receivedSize * 2 === file.size) {
      var received = new window.Blob(receiveBuffer);
      receiveBuffer = [];

      downloadDiv.href = URL.createObjectURL(received);
      downloadDiv.download = "new file ";
      var text = 'Click to download \'' + "new file" + '\' (' + " 123K" +
          ' bytes)';
      downloadDiv.appendChild(document.createTextNode(text));
      downloadDiv.style.display = 'block';

    }
  }

function handleReceiveChannelStateChange(receiveChannel) {
  var readyState = receiveChannel.readyState;
  trace('Receive channel state is: ' + readyState);
  enableMessageInterface(readyState == "open");
}

function getVideoElement(sessionId) {
  console.log('get Video element of '  +sessionId);
  var remoteVideo = document.getElementById(sessionId);
  if(null == remoteVideo) {
    console.log('create Video element of '  +sessionId);
        remoteVideo = document.createElement('video');
        remoteVideo.id = sessionId;
        remoteVideo.setAttribute('autoplay',true);
//        remoteVideo.setAttribute('muted',false);
        remoteVideo.setAttribute('volume',10);
        remoteVideo.setAttribute('controls',true);
        document.getElementById('remoteVideo').appendChild(remoteVideo);
      }
  else {
    console.log('Video element of '  +sessionId + ' already exist');
  }
  return remoteVideo;
}

window.onload = function() {
  initLocalMedia();
//  waittingForWebSocket(socket,queryPeer);
};

function initLocalMedia() {
  trace('Requesting local stream');
  // Call getUserMedia() via the polyfill.
  getUserMedia({
    audio : true,
    video : true
  }, gotStream, function(e) {
    console.log('getUserMedia() error: ', e);
    console.log(' ' + e.name);
    console.log(' ' + videoConstrain);
    /*if(e.name && e.name == 'DevicesNotFoundError' && retry == true) {
      console.log('retry ');
      retry = false;
      videoConstrain = false;
      initLocalMedia();
    }*/
    waittingForWebSocket(socket,queryPeer);
  });
  console.log('muted ' + localVideo.muted);
  console.log('volume ' + localVideo.volume);
}

function gotStream(stream) {
  trace('Received local stream');
  // Call the polyfill (adapter.js) to attach the media stream to this element.
  attachMediaStream(localVideo, stream);
  localStream = stream;
  window.localstream = stream;
  waittingForWebSocket(socket,queryPeer);
}

function waittingForWebSocket(webSocket, callback){
  console.log('waitting for webSocket ');
    setTimeout(
        function () {
            if (webSocket.readyState === 1) {
                console.log("websocket is ready")
                if(callback){
                    callback();
                }
                return;

            } else {
                console.log("waitting for WebSocket...")
                waittingForWebSocket(webSocket, callback);
            }

        }, 5);
}

function queryPeer() {
  trace("query peer");
  socket.send(JSON.stringify({
        type : 'query_peer'
      }));
}


function sendData() {
    var data = sendTextarea.value;

    for(var prop in datachannels){
        if(datachannels.hasOwnProperty(prop)){
            console.log('key is ' + prop +' and value is' + datachannels[prop]);
            datachannels[prop].send(data);
        }
    }

    trace('Sent data: ' + data);
    var newLine = document.createElement('label');
    newLine.id =labelId;
    labelId +=1;
    newLine.style.color='LightSkyBlue ';
    newLine.innerHTML = socket.sessionId + ': ' + data + '\n';
    receiveTextarea.appendChild(newLine);
    sendTextarea.value = '';
  }


function createFileChannel() {

  for(var prop in connections){
        if(connections.hasOwnProperty(prop)){
            console.log('key is ' + prop +' and value is' + connections[prop]);
            var sendChannel = connections[prop].createDataChannel('sendFileDataChannel');
            sendChannel.binaryType = 'arraybuffer';
            trace('Created send file channel');
            sendChannel.onopen = onSendChannelStateChange(sendChannel);
            sendChannel.onclose = onSendChannelStateClosed(sendChannel);
        }
    }
  }

function onSendChannelStateChange(sendChannel) {
    var readyState = sendChannel.readyState;
    trace('Send channel state is: ' + readyState);
    if (readyState === 'open') {
      sendFile(sendChannel);
    }
  }

function onSendChannelStateClosed(sendChannel) {
  var readyState = sendChannel.readyState;
  trace('Send channel state is: ' + readyState);
}


function sendFile(sendChannel) {
    var file = fileInput.files[0];
    trace('file is ' + [file.name, file.size, file.type,
        file.lastModifiedDate].join(' '));
    if (file.size === 0) {
      return;
    }
    socket.send(JSON.stringify({
      type : 'send_file',
      sessionId : socket.sessionId,
      fileSize : file.size,
      fileName : file.name
    }));
    sendProgress.max = file.size;
    receiveProgress.max = file.size;
    var chunkSize = 16384;
    var sliceFile = function(offset) {
      var reader = new window.FileReader();
      reader.onload = (function() {
      console.log('onload 1');
        return function(e) {
          console.log(offset + chunkSize);
          sendChannel.send(e.target.result);
          if (file.size > offset + e.target.result.byteLength) {
            window.setTimeout(sliceFile, 0, offset + chunkSize);
          }
          sendProgress.value = offset + e.target.result.byteLength;
        };
      })(file);
      console.log('offset 2' + offset);
      var slice = file.slice(offset, offset + chunkSize);
      reader.readAsArrayBuffer(slice);
      console.log('read 3' + offset);
    };
    sliceFile(0);
  }


function gotRemoteStream(event){
  var remoteVideo = document.createElement('video');
  remoteVideo.id = remoteVideoId;
  remoteVideoId = remoteVideoId + 1;
  remoteVideo.setAttribute('autoplay',true);
//  remoteVideo.setAttribute('muted',true);
  document.getElementById('remoteVideo').appendChild(remoteVideo);
  attachMediaStream(remoteVideo, event.stream);
  trace("Received remote stream");
}

function handleError(){}


///////////////////////////////////////////

// Set Opus as the default audio codec if it's present.
function preferOpus(sdp) {
  var sdpLines = sdp.split('\r\n');
  var mLineIndex;
  // Search for m line.
  for (var i = 0; i < sdpLines.length; i++) {
    if (sdpLines[i].search('m=audio') !== -1) {
      mLineIndex = i;
      break;
    }
  }
  if (mLineIndex === null) {
    return sdp;
  }

  // If Opus is available, set it as the default in m line.
  for (i = 0; i < sdpLines.length; i++) {
    if (sdpLines[i].search('opus/48000') !== -1) {
      var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
      if (opusPayload) {
        sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex],
            opusPayload);
      }
      break;
    }
  }

  // Remove CN in m line and sdp.
  sdpLines = removeCN(sdpLines, mLineIndex);

  sdp = sdpLines.join('\r\n');
  return sdp;
}

function extractSdp(sdpLine, pattern) {
  var result = sdpLine.match(pattern);
  return result && result.length === 2 ? result[1] : null;
}

// Set the selected codec to the first in m line.
function setDefaultCodec(mLine, payload) {
  var elements = mLine.split(' ');
  var newLine = [];
  var index = 0;
  for (var i = 0; i < elements.length; i++) {
    if (index === 3) { // Format of media starts from the fourth.
      newLine[index++] = payload; // Put target payload to the first.
    }
    if (elements[i] !== payload) {
      newLine[index++] = elements[i];
    }
  }
  return newLine.join(' ');
}

// Strip CN from sdp before CN constraints is ready.
function removeCN(sdpLines, mLineIndex) {
  var mLineElements = sdpLines[mLineIndex].split(' ');
  // Scan from end for the convenience of removing an item.
  for (var i = sdpLines.length - 1; i >= 0; i--) {
    var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
    if (payload) {
      var cnPos = mLineElements.indexOf(payload);
      if (cnPos !== -1) {
        // Remove CN payload from m line.
        mLineElements.splice(cnPos, 1);
      }
      // Remove CN line in sdp
      sdpLines.splice(i, 1);
    }
  }

  sdpLines[mLineIndex] = mLineElements.join(' ');
  return sdpLines;
}
