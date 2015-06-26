/*
 *  Copyright (c) 2014 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

'use strict';

var localVideo = document.querySelector('video#localVideo');
var localStream ,localPeerConnection, remotePeerConnection;
//var remoteVideo = document.getElementById("remoteVideo");
var startButton = document.getElementById("startButton");
var callButton = document.getElementById("callButton");
var hangupButton = document.getElementById("hangupButton");
var connections = {};
var offerFinished = {};
startButton.disabled = false;
callButton.disabled = false;
hangupButton.disabled = true;
startButton.onclick = start;
callButton.onclick = call;
hangupButton.onclick = hangup;

localVideo.oncanplay = function() {
  console.log('oncanplay');
  for(var prop in connections){
      if(map.hasOwnProperty(prop)){
          console.log(' add local stream when stream is ready' );
          connections[prop].addStream(localStream);
      }
  }
};

var room = '/server/1';
var mediaConstraints = {
    'mandatory' : {
      'OfferToReceiveAudio' : true,
      'OfferToReceiveVideo' : true
    }
  };
var localDescription;
var servers = null;

/*localPeerConnection = new RTCPeerConnection(servers);
trace("Created local peer connection object localPeerConnection");
localPeerConnection.onicecandidate = gotLocalIceCandidate;
localPeerConnection.onaddstream = gotRemoteStream;*/
var socket = new WebSocket('ws://' + window.location.host + room);

socket.onmessage = function(message) {
  var msg = JSON.parse(message.data);

  switch (msg.type) {
  case 'assigned_id':
    socket.id = msg.id;
    socket.sessionId = msg.sessionId;
    /*connections[socket.sessionId] = createConnection();
    if(null != localStream) {
      connections[socket.sessionId].addStream(localStream);
      trace("Added localStream to localPeerConnection");
    }
    connections[socket.sessionId].createOffer(gotLocalDescription,handleError);*/

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
        sessionId : socket.sessionId
      }));
    }, null, mediaConstraints);
    getVideoElement(sessionId);
    offerFinished[sessionId] = true;
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
      offerFinished[sessionId] = true;
    }
    break;
  case 'received_candidate':
    console.log('received candidate from session ' + msg.sessionId);
    /*var candidate = new RTCIceCandidate({
      sdpMLineIndex : msg.data.label,
      candidate : msg.data.candidate
    });*/
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
//    connections[sessionId].addIceCandidate(candidate);
//    waittingOfferFinished(sessionId,msg.candidate);
    connections[sessionId].addIceCandidate(new RTCIceCandidate(msg.candidate));

//    setTimeout(
//            function () {
//                  console.log('prepare to add candidate  ');
//                  connections[sessionId].addIceCandidate(new RTCIceCandidate(msg.candidate));
//            }, 100);
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
        console.log(peerSessionIdArray[i]);
        console.log('query peer prepare to create connection for session id : ' + peerSessionIdArray[i]);
        var currentConnection = createConnection(peerSessionIdArray[i]);
        connections[peerSessionIdArray[i]] = currentConnection;
        if(null != localStream) {
           currentConnection.addStream(localStream);
           trace("Added localStream to Connection");
        }
        getVideoElement(peerSessionIdArray[i]);
        currentConnection.createOffer(function(description) {
          currentConnection.setLocalDescription(description);
          socket.send(JSON.stringify({
          type : 'received_offer',
          data : description,
          sessionId : socket.sessionId
            }));
          },handleError,mediaConstraints);
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

function createConnection(sessionId) {
  console.log('create connection ' + sessionId);
  var peerConnection  = new RTCPeerConnection(servers);
  peerConnection.onicecandidate = gotLocalIceCandidate;
  peerConnection.onaddstream = function(e) {
    var remoteVideo = getVideoElement(sessionId)
    attachMediaStream(remoteVideo, event.stream);
    trace("Received remote stream");
  };
  return peerConnection
}

function getVideoElement(sessionId) {
  console.log('get Video element of '  +sessionId);
  var remoteVideo = document.getElementById(sessionId);
  if(null == remoteVideo) {
    console.log('create Video element of '  +sessionId);
        remoteVideo = document.createElement('video');
        remoteVideo.id = sessionId;
        remoteVideo.setAttribute('autoplay',true);
        remoteVideo.setAttribute('muted',true);
        document.getElementById('remoteVideo').appendChild(remoteVideo);
      }
  else {
    console.log('Video element of '  +sessionId + ' already exist');
  }
  return remoteVideo;
}

window.onload = function() {
  initLocalMedia();
  waittingForWebSocket(socket,queryPeer);
};

function initLocalMedia() {
  trace('Requesting local stream');
  startButton.disabled = true;
  // Call getUserMedia() via the polyfill.
  getUserMedia({
    audio : true,
    video : true
  }, gotStream, function(e) {
    console.log('getUserMedia() error: ', e);
  });
}

function gotStream(stream) {
  trace('Received local stream');
  // Call the polyfill (adapter.js) to attach the media stream to this element.
  attachMediaStream(localVideo, stream);
  localStream = stream;
  window.localstream = stream;
  callButton.disabled = false;
//  var audioTracks = window.localstream.getAudioTracks();
//  var videoTracks = window.localstream.getVideoTracks();

}

function start() {
    trace("Requesting local stream");
    startButton.disabled = true;
    getUserMedia({audio:true, video:true}, gotStream,
      function(error) {
        trace("getUserMedia error: ", error);
      });
  }

function call() {
    callButton.disabled = true;
    hangupButton.disabled = false;
    trace("Starting call");
//    queryPeer();
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

function waittingOfferFinished(sessionId,candidate) {
  console.log('sessionId ' + sessionId);
  console.log(offerFinished[sessionId]);
  setTimeout(
          function () {
              if (null != offerFinished[sessionId]) {
                console.log('sessionId ' + sessionId);
                connections[sessionId].addIceCandidate(new RTCIceCandidate(candidate));
                  return;

              } else {
                  console.log("waitting for offer...")
                  waittingOfferFinished(sessionId);
              }

          }, 5);
}

function queryPeer() {
  trace("query peer");
  socket.send(JSON.stringify({
        type : 'query_peer'
      }));
}




function gotLocalIceCandidate(e){
  trace("got local ice candidate");
    if (e.candidate) {
    console.log('sending received candidate');
    socket.send(JSON.stringify({
      type : 'received_candidate',
      sessionId : socket.sessionId,
      candidate : e.candidate
      /*data : {
        label : e.candidate.sdpMLineIndex,
        id : e.candidate.sdpMid,
        candidate : e.candidate.candidate
      }*/
    }));
  }
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

function gotLocalDescription(description){
  localPeerConnection.setLocalDescription(description);
    localDescription = description;
    trace("Offer from localPeerConnection: \n" + description.sdp);
    socket.send(JSON.stringify({
      type : 'received_offer',
      data : description,
      sessionId : socket.sessionId
    }));
  }

function hangup() {
    trace("Ending call");
//    localPeerConnection.close();
    localPeerConnection = null;
    remotePeerConnection = null;
    hangupButton.disabled = true;
    callButton.disabled = false;
  }

/*

var localStream, localPeerConnection, remotePeerConnection;

var localVideo = document.getElementById("localVideo");
var remoteVideo = document.getElementById("remoteVideo");

var startButton = document.getElementById("startButton");
var callButton = document.getElementById("callButton");
var hangupButton = document.getElementById("hangupButton");
startButton.disabled = false;
callButton.disabled = true;
hangupButton.disabled = true;
startButton.onclick = start;
callButton.onclick = call;
hangupButton.onclick = hangup;

function trace(text) {
  console.log((performance.now() / 1000).toFixed(3) + ": " + text);
}

function gotStream(stream){
  trace("Received local stream");
  localVideo.src = URL.createObjectURL(stream);
  localStream = stream;
  callButton.disabled = false;
}

function start() {
  trace("Requesting local stream");
  startButton.disabled = true;
  getUserMedia({audio:true, video:true}, gotStream,
    function(error) {
      trace("getUserMedia error: ", error);
    });
}

function call() {
  callButton.disabled = true;
  hangupButton.disabled = false;
  trace("Starting call");

  if (localStream.getVideoTracks().length > 0) {
    trace('Using video device: ' + localStream.getVideoTracks()[0].label);
  }
  if (localStream.getAudioTracks().length > 0) {
    trace('Using audio device: ' + localStream.getAudioTracks()[0].label);
  }

  var servers = null;

  localPeerConnection = new RTCPeerConnection(servers);
  trace("Created local peer connection object localPeerConnection");
  localPeerConnection.onicecandidate = gotLocalIceCandidate;

  remotePeerConnection = new RTCPeerConnection(servers);
  trace("Created remote peer connection object remotePeerConnection");
  remotePeerConnection.onicecandidate = gotRemoteIceCandidate;
  remotePeerConnection.onaddstream = gotRemoteStream;

  localPeerConnection.addStream(localStream);
  trace("Added localStream to localPeerConnection");
  localPeerConnection.createOffer(gotLocalDescription,handleError);
}

function gotLocalDescription(description){
  localPeerConnection.setLocalDescription(description);
  trace("Offer from localPeerConnection: \n" + description.sdp);
  remotePeerConnection.setRemoteDescription(description);
  remotePeerConnection.createAnswer(gotRemoteDescription,handleError);
}

function gotRemoteDescription(description){
  remotePeerConnection.setLocalDescription(description);
  trace("Answer from remotePeerConnection: \n" + description.sdp);
  localPeerConnection.setRemoteDescription(description);
}

function hangup() {
  trace("Ending call");
  localPeerConnection.close();
  remotePeerConnection.close();
  localPeerConnection = null;
  remotePeerConnection = null;
  hangupButton.disabled = true;
  callButton.disabled = false;
}

function gotRemoteStream(event){
  remoteVideo.src = URL.createObjectURL(event.stream);
  trace("Received remote stream");
}

function gotLocalIceCandidate(event){
  if (event.candidate) {
    remotePeerConnection.addIceCandidate(new RTCIceCandidate(event.candidate));
    trace("Local ICE candidate: \n" + event.candidate.candidate);
  }
}

function gotRemoteIceCandidate(event){
  if (event.candidate) {
    localPeerConnection.addIceCandidate(new RTCIceCandidate(event.candidate));
    trace("Remote ICE candidate: \n " + event.candidate.candidate);
  }
}
*/
function handleError(){}