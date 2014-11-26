var express = require('express');
var app = express()
	, server = require('http').createServer(app)
	, io = require('socket.io').listen(server);

app.use("/js", express.static(__dirname + '/js'));

server.listen(8080);

var game ={
	team1: {
		players: [],
		score: 0
	},
	team2: {
		players: [],
		score: 0
	},
	word: "",
	turn1: true,
	drawer: "",
	picture: [[]],
	drawPile: ["test", "words", "here"],
	started: false,
	drawTime: 60000
};

function fisherYates ( myArray ) {
	var i = myArray.length, j, tempi, tempj;
	if ( i == 0 ) return false;
	while ( --i ) {
		j = Math.floor( Math.random() * ( i + 1 ) );
		tempi = myArray[i];
		tempj = myArray[j];
		myArray[i] = tempj;
		myArray[j] = tempi;
	}
}

app.get('/', function(req, res) {
	res.sendFile(__dirname + '/pict.html');
});

function start_game() {
	//randomize words
	fisherYates(game.drawPile);
	//randomize players
	fisherYates(game.team1.players);
	fisherYates(game.team2.players);
	//randomly assign first team to draw
	game.turn1 = (Math.floor(Math.random() * 2) == 0);
	
	//assign drawer
	(game.turn1) ? game.drawer = game.team1.players[0] : game.drawer = game.team2.players[0];
	
	//assign word
	game.word = game.drawPile.shift();
	
	//start game (for people joining later)
	game.start = true;
	
	//let the players know the game is starting
	io.sockets.emit('start_game', game);
}

function start_round(socket) {
	//let other players know the round is started
	socket.broadcast.emit('start_round', game);
	
	//the server is the final word on timing, so it keeps track itself
	game.timeout = setTimeout(end_round, game.drawTime);
}

function end_round() {
	//flip turn
	game.turn1 = !game.turn1;
	
	//assign new drawer
	if (game.turn1) {
		game.team1.players.push(game.team1.players.shift());
		game.drawer = game.team1[0];
	} else {
		game.team2.players.push(game.team2.players.shift());
		game.drawer = game.team2[0];
	}
	
	//assign new word after checking we have one
	if (game.drawPile.length == 0) {
		end_game('out of words');
		return;
	}
	game.word = game.drawPile.shift();
	
	//let everyone know the round is over and a new one is starting
	io.sockets.emit('end_round', game);
}

function new_word(socket) {
	//make sure we have a word to send, if not end the game
	if (game.drawPile.length == 0) {
		end_game('out of words');
		return;
	}
	
	//assign new word
	game.word = game.drawPile.shift();
	
	//send it out to the drawer, since the others won't know until the round starts
	socket.emit('new_word', game);
}

function win_round() {
	//increment the team's score
	(game.turn == 1) ? game.team1.score++ : game.team2.score++;
	
	//clear the end_round timeout
	clearTimeout(game.timeout);
	
	//then call end_round manually
	end_round();
}

function end_game(reason) {
	
}

io.sockets.on('connection', function (socket) {
  
  //let the client know we're connected
  socket.emit('handshake', game);
  
  socket.on('join', function(player) {
	//if the player is new
	if (game.team1.players.indexOf(player) < 0 && game.team2.players.indexOf(player) < 0) {
		console.log("New player " + player + " joined");
		
		//add the new person to the smallest team
		(game.team1.players.length > game.team2.players.length) ? game.team2.players.push(player) : game.team1.players.push(player);
		
		console.dir(game.team1);
		console.dir(game.team2);
		
		//check to start the game
		if (!game.started && game.team1.players.length >= 2 && game.team2.players.length >= 2) {
			console.log("starting game");
			start_game();
		} else if (game.started) {
			socket.emit('join_game', game);
		} else {
			socket.emit('wait');
		}
	}
  });
  
  socket.on('update_stroke', function(pos) {
	game.picture[game.picture.length - 1].push(pos);
	socket.broadcast.emit('update_stroke', pos);
  });
  
  socket.on('start_stroke', function() {
	game.picture.push([]);
	socket.broadcast.emit('start_stroke');
  });
  
  socket.on('end_stroke', function() {
	socket.broadcast.emit('end_stroke');
  });
  
  socket.on('clear', function() {
	game.picture = [[]];
	socket.broadcast.emit('clear');
  });
  
  socket.on('new_word', function() {
	//the drawer wanted a new word
	new_word(socket);
  });
  
  socket.on('start_round', function() {
	//got the go-ahead from the drawer
	start_round(socket);
  });
  
  socket.on('end_round', function() {
	//the drawer ended the round early, meaning the team won
	win_round();
  });
  
  
  
 });