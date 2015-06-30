'use strict';

var localVideo = document.querySelector('video#localVideo');

var sendButton = document.getElementById("sendButton");
var sendTextarea = document.getElementById("dataChannelSend");
var receiveTextarea = document.getElementById("dataChannelReceive");

sendButton.onclick = sendData;
var labelId = 0;

var localStream;
var connections = {};
var datachannels = {};

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
      connections[sessionId].setLocalDescription(description);
      socket.send(JSON.stringify({
        type : 'received_answer',
        data : description,
        sessionId : socket.sessionId,
        peerSessionId : sessionId
      }));
    }, null, mediaConstraints);
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
        currentConnection.setLocalDescription(description);
        socket.send(JSON.stringify({
        type : 'received_offer',
        data : description,
        sessionId : socket.sessionId,
        peerSessionId : peerId
          }));
        },handleError,mediaConstraints);
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
    attachMediaStream(remoteVideo, event.stream);
    trace("Received remote stream");
  };
  var sendChannel = peerConnection.createDataChannel("",{reliable: false});
  datachannels[sessionId] = sendChannel;
  sendChannel.onmessage = handleMessage;
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

  peerConnection.ondatachannel = gotReceiveChannel;
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
    receiveChannel.onmessage = handleMessage;
    receiveChannel.onopen = handleReceiveChannelStateChange(receiveChannel);
    receiveChannel.onclose = handleReceiveChannelStateChange(receiveChannel);
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
//        remoteVideo.setAttribute('volume',0);
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
    waittingForWebSocket(socket,queryPeer);
  });
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
    newLine.innerHTML = data + '\n';
    receiveTextarea.appendChild(newLine);
    sendTextarea.value = '';
  }



function gotRemoteStream(event){
  var remoteVideo = document.createElement('video');
  remoteVideo.id = remoteVideoId;
  remoteVideoId = remoteVideoId + 1;
  remoteVideo.setAttribute('autoplay',true);
  remoteVideo.setAttribute('muted',true);
  document.getElementById('remoteVideo').appendChild(remoteVideo);
  attachMediaStream(remoteVideo, event.stream);
  trace("Received remote stream");
}

function handleError(){}