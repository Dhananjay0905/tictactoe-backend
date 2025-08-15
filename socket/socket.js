const games = {}; // In-memory store for active games

function initializeSocket(io) {
  io.on("connection", (socket) => {
    console.log(`[Socket.io] User connected: ${socket.id}`);

    socket.on("createGame", (data) => {
      console.log(
        `[Socket.io] 'createGame' event received from ${socket.id}`,
        data
      );
      const gameId = Math.random().toString(36).substring(2, 8);
      games[gameId] = {
        players: [{ id: socket.id, symbol: data.symbol }],
        board: Array(9).fill(null),
        currentPlayer: data.symbol,
        gameMode: data.gameMode,
        difficulty: data.difficulty,
        winner: null,
        rematch: [], // Array to store IDs of players who want a rematch
      };
      socket.join(gameId);
      console.log(
        `[Socket.io] Game ${gameId} created. Emitting 'gameCreated'.`
      );
      socket.emit("gameCreated", { gameId, gameState: games[gameId] });
    });

    socket.on("joinGame", (data) => {
      const { gameId } = data;
      const game = games[gameId];

      if (game && game.players.length < 2) {
        const player1Symbol = game.players[0].symbol;
        const player2Symbol = player1Symbol === "X" ? "O" : "X";
        game.players.push({ id: socket.id, symbol: player2Symbol });
        socket.join(gameId);
        console.log(
          `[Socket.io] Player ${socket.id} joined game ${gameId}. Emitting 'gameUpdate'.`
        );
        io.to(gameId).emit("gameUpdate", game);
      } else {
        socket.emit("error", "Game not found or is full.");
      }
    });

    socket.on("makeMove", (data) => {
      const { gameId, index, playerSymbol } = data;
      const game = games[gameId];

      if (
        !game ||
        game.board[index] !== null ||
        game.currentPlayer !== playerSymbol ||
        game.winner
      ) {
        return; // Invalid move
      }

      game.board[index] = playerSymbol;
      const winner = checkWinner(game.board);

      if (winner) {
        game.winner = winner;
        io.to(gameId).emit("gameOver", game);
      } else if (game.board.every((cell) => cell !== null)) {
        game.winner = "draw";
        io.to(gameId).emit("gameOver", game);
      } else {
        game.currentPlayer = game.currentPlayer === "X" ? "O" : "X";
        io.to(gameId).emit("gameUpdate", game);

        if (
          game.gameMode === "ai" &&
          game.currentPlayer !== game.players[0].symbol
        ) {
          setTimeout(() => aiMove(game, gameId, io), 500);
        }
      }
    });

    socket.on("requestRematch", ({ gameId }) => {
      const game = games[gameId];
      if (!game) return;

      if (!game.rematch.includes(socket.id)) {
        game.rematch.push(socket.id);
      }

      io.to(gameId).emit("rematchOffer", { player: socket.id });

      if (
        game.rematch.length === 2 ||
        (game.gameMode === "ai" && game.rematch.length === 1)
      ) {
        // Reset game for rematch
        game.board = Array(9).fill(null);
        game.winner = null;
        game.rematch = [];
        // Alternate who starts the next game
        game.currentPlayer =
          game.players.length > 1
            ? game.players[1].symbol
            : game.players[0].symbol;
        // Swap player symbols for the next game
        [game.players[0].symbol, game.players[1].symbol] = [
          game.players[1].symbol,
          game.players[0].symbol,
        ];

        io.to(gameId).emit("gameUpdate", game);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[Socket.io] User disconnected: ${socket.id}`);
      for (const gameId in games) {
        const game = games[gameId];
        const playerIndex = game.players.findIndex((p) => p.id === socket.id);
        if (playerIndex !== -1) {
          io.to(gameId).emit("playerLeft", {
            message: "The other player has left the game.",
          });
          delete games[gameId];
          break;
        }
      }
    });
  });
}

function checkWinner(board) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (let i = 0; i < lines.length; i++) {
    const [a, b, c] = lines[i];
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

// AI functions (getEasyMove, getMediumMove, getHardMove, minimax, aiMove) remain the same...

function aiMove(game, gameId, io) {
  const aiSymbol = game.currentPlayer;
  let move;

  switch (game.difficulty) {
    case "easy":
      move = getEasyMove(game.board);
      break;
    case "medium":
      move = getMediumMove(game.board, aiSymbol);
      break;
    case "hard":
      move = getHardMove(game.board, aiSymbol, game.players[0].symbol);
      break;
    default:
      move = getEasyMove(game.board);
  }

  if (move !== null) {
    game.board[move] = aiSymbol;
    const winner = checkWinner(game.board);

    if (winner) {
      game.winner = winner;
      io.to(gameId).emit("gameOver", game);
    } else if (game.board.every((cell) => cell !== null)) {
      game.winner = "draw";
      io.to(gameId).emit("gameOver", game);
    } else {
      game.currentPlayer = game.players[0].symbol; // It's the human's turn
      io.to(gameId).emit("gameUpdate", game);
    }
  }
}

function getEasyMove(board) {
  const availableMoves = board
    .map((val, idx) => (val === null ? idx : null))
    .filter((val) => val !== null);
  if (availableMoves.length > 0) {
    return availableMoves[Math.floor(Math.random() * availableMoves.length)];
  }
  return null;
}

function getMediumMove(board, aiSymbol) {
  const opponentSymbol = aiSymbol === "X" ? "O" : "X";
  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) {
      const boardCopy = [...board];
      boardCopy[i] = aiSymbol;
      if (checkWinner(boardCopy) === aiSymbol) return i;
    }
  }
  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) {
      const boardCopy = [...board];
      boardCopy[i] = opponentSymbol;
      if (checkWinner(boardCopy) === opponentSymbol) return i;
    }
  }
  return getEasyMove(board);
}

function getHardMove(board, aiSymbol, huPlayer) {
  const bestMove = minimax(board, aiSymbol, aiSymbol, huPlayer);
  return bestMove.index;
}

function minimax(newBoard, player, aiPlayer, huPlayer) {
  const availSpots = newBoard
    .map((val, idx) => (val === null ? idx : null))
    .filter((val) => val !== null);

  if (checkWinner(newBoard) === huPlayer) {
    return { score: -10 };
  } else if (checkWinner(newBoard) === aiPlayer) {
    return { score: 10 };
  } else if (availSpots.length === 0) {
    return { score: 0 };
  }

  const moves = [];
  for (let i = 0; i < availSpots.length; i++) {
    const move = {};
    move.index = availSpots[i];
    newBoard[availSpots[i]] = player;

    if (player === aiPlayer) {
      const result = minimax(newBoard, huPlayer, aiPlayer, huPlayer);
      move.score = result.score;
    } else {
      const result = minimax(newBoard, aiPlayer, aiPlayer, huPlayer);
      move.score = result.score;
    }

    newBoard[availSpots[i]] = null;
    moves.push(move);
  }

  let bestMove;
  if (player === aiPlayer) {
    let bestScore = -10000;
    for (let i = 0; i < moves.length; i++) {
      if (moves[i].score > bestScore) {
        bestScore = moves[i].score;
        bestMove = i;
      }
    }
  } else {
    let bestScore = 10000;
    for (let i = 0; i < moves.length; i++) {
      if (moves[i].score < bestScore) {
        bestScore = moves[i].score;
        bestMove = i;
      }
    }
  }
  return moves[bestMove];
}
