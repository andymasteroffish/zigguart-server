const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 3000 }, () => {
  console.log('listening on 3000');
});

var clients = [];
var players = [];

console.log("I LIVE");

wss.on('connection', function connection(ws) {
  console.log("CONNECTION");

  clients.push(ws);

  //ws.send("Hello new friend");

  ws.on('message', function incoming(message) {
    //let message_raw = String(message);
    console.log('received: %s', message);

    let msg = JSON.parse(message)
    console.log(msg)
    //return;
    
    //console.log(message_raw);

    // let split = message_raw.split("$");
    // if (split.length != 2){
    //   console.log("BAD MESSAGE:"+message);
    //   return;
    // }

    // let type = split[0];
    // let raw_text = split[1];

    // console.log("type:"+type);
    // console.log("text:"+raw_text); 

    if (msg.type === "join"){
      console.log("new player here");
      let player = {
        is_host : msg.is_host == "True",
        room_id : msg.room,
        ws : ws
      }
      players.push(player);
    }

    if (msg.type === "board"){
      let room_id = msg.room;
      console.log("got a board for room:"+room_id);

      //find all clients for that room and send it
      let test_count = 0;
      players.forEach( player => {
        if (player.room_id == room_id){
          player.ws.send("board$"+msg.raw_text);
          test_count++;
        }
      })
      console.log("sent board to "+test_count+" clients");

    }

    /*
    for (var i = 0; i < clients.length; i++) {
      //console.log(clients[i])

      //clients[i] != ws so we don't repeat messages back to the sender
      if(clients[i].readyState === 1 && clients[i] != ws){
        clients[i].send(message);
      }
    }
    */
  });

});

//NEED A CLIENT DISCONNECT FUNCTION!!!