const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const jogadores = {};

const mapa = [
    "#####################",
    "#.........#.........#",
    "#.###.###.#.###.###.#",
    "#.#.....#...#.....#.#",
    "#.#.###.#####.###.#.#",
    "#...................#",
    "#.###.#.#######.#.###",
    "#.....#...#...#.....#",
    "#####.###.#.###.#####",
    "#.........#.........#",
    "#####.###.#.###.#####",
    "#.....#...#...#.....#",
    "#.###.#.#######.#.###",
    "#...................#",
    "#.#.###.#####.###.#.#",
    "#.#.....#...#.....#.#",
    "#.###.###.#.###.###.#",
    "#.........#.........#",
    "#####################"
];

let comidas = [];

function criarComidas() {
    comidas = [];

    for (let y = 0; y < mapa.length; y++) {
        for (let x = 0; x < mapa[y].length; x++) {
            if (mapa[y][x] === ".") {
                comidas.push(`${x},${y}`);
            }
        }
    }
}

criarComidas();

function podeAndar(x, y) {
    if (y < 0 || y >= mapa.length) return false;
    if (x < 0 || x >= mapa[y].length) return false;

    return mapa[y][x] !== "#";
}

function enviarEstado() {
    io.emit("estado", {
        jogadores: Object.values(jogadores),
        comidas,
        mapa
    });
}

io.on("connection", (socket) => {

    socket.on("entrar", (nome) => {

        jogadores[socket.id] = {
            id: socket.id,
            nome: nome.substring(0, 12),
            x: 1,
            y: 1,
            pontos: 0,
            cor: `hsl(${Math.floor(Math.random() * 360)}, 80%, 55%)`
        };

        enviarEstado();
    });

    socket.on("mover", (direcao) => {

        const jogador = jogadores[socket.id];

        if (!jogador) return;

        let novoX = jogador.x;
        let novoY = jogador.y;

        if (direcao === "up") novoY--;
        if (direcao === "down") novoY++;
        if (direcao === "left") novoX--;
        if (direcao === "right") novoX++;

        if (!podeAndar(novoX, novoY)) return;

        jogador.x = novoX;
        jogador.y = novoY;

        const comida = `${novoX},${novoY}`;

        if (comidas.includes(comida)) {

            comidas = comidas.filter((c) => c !== comida);

            jogador.pontos += 10;

            io.emit(
                "evento",
                `🍒 ${jogador.nome} pegou uma comida!`
            );

            if (comidas.length === 0) {

                criarComidas();

                Object.values(jogadores).forEach((j) => {
                    j.pontos += 100;
                });

                io.emit(
                    "evento",
                    "🏆 Todas as comidas foram coletadas!"
                );
            }
        }

        enviarEstado();
    });

    socket.on("disconnect", () => {

        delete jogadores[socket.id];

        enviarEstado();
    });
});

server.listen(3000, () => {
    console.log("🎮 Jogo rodando em http://localhost:3000");
});