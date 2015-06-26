package com.github.joelbars.socket;

import static java.util.Collections.emptySet;

import java.io.IOException;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.StringJoiner;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.stream.Collectors;

import javax.json.Json;
import javax.json.JsonObject;
import javax.websocket.OnClose;
import javax.websocket.OnError;
import javax.websocket.OnMessage;
import javax.websocket.OnOpen;
import javax.websocket.Session;
import javax.websocket.server.PathParam;
import javax.websocket.server.ServerEndpoint;

import com.github.joelbars.Room;

/**
 * Created by joel on 21/05/15.
 */
@ServerEndpoint("/server/{room}")
public class WebSocketListener {


    private ConcurrentMap<String, Set<Session>> rooms = Room.INSTANCE.map();

    private static final Set<Session> EMPTY_ROOM = emptySet();

    @OnOpen
    public void onOpen(Session peer, @PathParam("room") String room) throws IOException {
        System.out.println("open");
        if (room != null && !room.isEmpty()) {
            rooms.computeIfAbsent(room, s -> new CopyOnWriteArraySet<>()).add(peer);
            System.out.println("open->num:" + rooms.get(room).size());


            peer.getBasicRemote().sendText(Json.createObjectBuilder().add("type", "assigned_id").add("id", room).add("sessionId", peer.getId()).build().toString());
        } else {
            peer.close();
        }

    }

    @OnClose
    public void onClose(Session peer, @PathParam("room") String room) throws IOException {
        System.out.println("close");
        Optional.ofNullable(rooms.get(room))
                .orElseThrow(() -> new IllegalStateException("Cannot find room " + room))
                .remove(peer);
        rooms.getOrDefault(room, EMPTY_ROOM)
            .parallelStream()
            .filter(s -> s.isOpen())
            .forEach(s -> s.getAsyncRemote()
                    .sendText(Json.createObjectBuilder().add("type", "connection_closed").add("peer", peer.getId()).build().toString()));
    }

    @OnError
    public void onError(Session peer, Throwable th, @PathParam("room") String room) {
        System.out.println("Peer error " + room + " " + th);
    }

    @OnMessage
    public void onMessage(String message, Session peer, @PathParam("room") String room) throws IOException {
        System.out.println("message");
        System.out.println(message);
        System.out.println(peer);
        System.out.println("~~~~~~~~~~~~~~~~~~~~");
        JsonObject o = Json.createReader(new StringReader(message)).readObject();
        String type = o.getString("type");
        switch(type) {
        case "received_offer":
        case "received_candidate":
        case "received_answer":
            rooms.getOrDefault(room, EMPTY_ROOM).parallelStream()
                .filter(s -> s != peer && s.isOpen())
                .forEach(s -> s.getAsyncRemote().sendObject(message));
            break;
/*            String answerSessionId = o.getString("sessionId");
            System.out.println(" peer received_answer " + peer.getId());
            System.out.println(" ");
            rooms.getOrDefault(room, EMPTY_ROOM).parallelStream()
            .filter(s -> s.getId().equals(answerSessionId) && s.isOpen())
            .forEach(s -> s.getAsyncRemote().sendObject(message));
            break;
*/
        case "query_peer":
            List<String> sessionIdList = new ArrayList<String>();
            for (Session session :  rooms.get(room)) {
                if (session.equals(peer)) {
                    continue;
                }
                sessionIdList.add(session.getId());
            }
            String peerSessions = sessionIdList.stream().collect(Collectors.joining(","));
            peer.getBasicRemote().sendText(Json.createObjectBuilder().add("type", "query_peer").add("peerSessionIds", peerSessions).build().toString());
        break;

        case "close":
            peer.close();
        }
    }
}
