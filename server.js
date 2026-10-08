const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const {
    SQSClient,
    SendMessageCommand
} = require("@aws-sdk/client-sqs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const QUEUE_URL = process.env.SQS_QUEUE_URL;

const sqs = new SQSClient({
    region: process.env.AWS_REGION || "us-east-1"
});

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

async function enviarMensagemSQS(evento) {
    if (!QUEUE_URL) {
        console.log("SQS_QUEUE_URL nao configurada. Evento:", evento);
        return;
    }

    try {
        await sqs.send(
            new SendMessageCommand({
                QueueUrl: QUEUE_URL,
                MessageBody: JSON.stringify({
                    jogo: "Pac Arena",
                    dataHora: new Date().toISOString(),
                    ...evento
                })
            })
        );

        console.log("Mensagem enviada ao SQS:", evento.tipo);
    } catch (erro) {
        console.error("Erro ao enviar mensagem ao SQS:", erro.message);
    }
}

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
            nome: String(nome).substring(0, 12),
            x: 1,
            y: 1,
            pontos: 0,
            cor: `hsl(${Math.floor(Math.random() * 360)}, 80%, 55%)`
        };

        const jogador = jogadores[socket.id];

        io.emit("evento", `${jogador.nome} entrou no jogo!`);

        enviarMensagemSQS({
            tipo: "JOGADOR_ENTROU",
            jogador: jogador.nome
        });

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

            io.emit("evento", `${jogador.nome} pegou uma comida!`);

            enviarMensagemSQS({
                tipo: "COMIDA_COLETADA",
                jogador: jogador.nome,
                pontosGanhos: 10,
                pontuacaoTotal: jogador.pontos,
                posicao: {
                    x: novoX,
                    y: novoY
                }
            });

            if (comidas.length === 0) {
                criarComidas();

                Object.values(jogadores).forEach((j) => {
                    j.pontos += 100;
                });

                io.emit("evento", "Todas as comidas foram coletadas!");

                enviarMensagemSQS({
                    tipo: "FASE_CONCLUIDA",
                    jogadores: Object.values(jogadores).map((j) => ({
                        nome: j.nome,
                        pontuacao: j.pontos
                    }))
                });
            }
        }

        enviarEstado();
    });

    socket.on("disconnect", () => {
        const jogador = jogadores[socket.id];

        if (jogador) {
            enviarMensagemSQS({
                tipo: "JOGADOR_SAIU",
                jogador: jogador.nome
            });
        }

        delete jogadores[socket.id];

        enviarEstado();
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Jogo rodando na porta ${PORT}`);

    if (QUEUE_URL) {
        console.log("Fila SQS configurada.");
    } else {
        console.log("Aviso: SQS_QUEUE_URL ainda nao foi configurada.");
    }
});