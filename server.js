const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const nodemailer = require('nodemailer');

const app = express();
const porta = 3000;

app.use(cors({
    origin: '*', // Permite que qualquer página acesse a API
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));


app.use(express.json());

// --- LIGAÇÃO AO BANCO DE DADOS ---
const conexao = mysql.createConnection({
    host: 'localhost',
    user: 'root',      
    password: '',      
    database: 'autoassis_db'
});

conexao.connect((erro) => {
    if (erro) {
        console.error('❌ Erro ao ligar ao banco de dados:', erro.message);
        return;
    }
    console.log('✅ Ligado ao banco de dados MySQL com sucesso!');
});

// --- ROTA DE ENVIO DE E-MAIL (MODO DE APRESENTAÇÃO - ETHEREAL) ---
app.post('/api/recuperar-senha', async (req, res) => {
    const { email, senha } = req.body;

    try {
        console.log('⏳ A gerar conta de testes para enviar o e-mail...');
        const testAccount = await nodemailer.createTestAccount();

        const transporter = nodemailer.createTransport({
            host: "smtp.ethereal.email",
            port: 587,
            secure: false, 
            auth: {
                user: testAccount.user, 
                pass: testAccount.pass, 
            },
        });

        const opcoesEmail = {
            from: '"Auto+Assis Oficina" <nao-responda@autoassis.com>', 
            to: email, 
            subject: 'Recuperação de Senha - Auto+Assis',
            text: `Olá!\n\nRecebemos um pedido de recuperação de senha para a sua conta.\n\nA sua senha atual é: ${senha}\n\nRecomendamos que mantenha a sua senha num local seguro.\n\nCom os melhores cumprimentos,\nEquipe Auto+Assis`,
            html: `<p>Olá!</p><p>Recebemos um pedido de recuperação de senha para a sua conta.</p><p>A sua senha atual é: <b style="color: #ff6a00; font-size: 18px;">${senha}</b></p><p>Recomendamos que mantenha a sua senha num local seguro.</p><p>Com os melhores cumprimentos,<br><b>Equipe Auto+Assis</b></p>`
        };

        const info = await transporter.sendMail(opcoesEmail);
        const linkEthereal = nodemailer.getTestMessageUrl(info);

        console.log('📧 E-mail processado com sucesso!');
        
        // Responde mandando o link de volta para a tela!
        res.json({ 
            mensagem: '✅ E-mail enviado com sucesso!',
            linkApresentacao: linkEthereal 
        });

    } catch (erro) {
        console.error('❌ Erro Fatal ao enviar e-mail:', erro);
        res.status(500).json({ erro: 'Erro ao enviar e-mail.' });
    }
});

// --- ROTAS DE PEÇAS (ESTOQUE) ---
app.get('/api/pecas', (req, res) => {
    conexao.query('SELECT * FROM pecas', (erro, resultados) => {
        if (erro) return res.status(500).json({ erro: 'Erro ao buscar peças' });
        res.json(resultados); 
    });
});

app.post('/api/pecas', (req, res) => {
    // Pegamos os dados do corpo da requisição (sem o ID manual)
    const { nome, categoria, localizacao, quantidade, min, preco } = req.body;
    
    // Mudamos de REPLACE para INSERT
    const sql = 'INSERT INTO pecas (nome, categoria, localizacao, quantidade, min, preco) VALUES (?, ?, ?, ?, ?, ?)';
    
    conexao.query(sql, [nome, categoria, localizacao, quantidade, min, preco], (erro, resultado) => {
        if (erro) {
            console.error('Erro ao inserir peça:', erro);
            return res.status(500).json({ erro: 'Erro ao guardar a peça' });
        }
        res.json({ mensagem: '✅ Peça cadastrada com sucesso!', id: resultado.insertId });
    });
});

app.delete('/api/pecas/:id', (req, res) => {
    conexao.query('DELETE FROM pecas WHERE id = ?', [req.params.id], (erro) => {
        if (erro) return res.status(500).json({ erro: 'Erro ao apagar' });
        res.json({ mensagem: '✅ Peça apagada!' });
    });
});

// --- ROTAS DE MOVIMENTAÇÕES ---
app.get('/api/movimentacoes', (req, res) => {
    conexao.query('SELECT * FROM movimentacoes', (erro, resultados) => {
        if (erro) return res.status(500).json({ erro: 'Erro ao buscar movimentacoes' });
        res.json(resultados);
    });
});

app.post('/api/movimentacoes', (req, res) => {
    const { pecaId, tipo, quantidade, data, obs } = req.body;
    
    // Garante que a quantidade é um número válido
    const qtdNum = Number(quantidade) || 0;
    
    // MÁGICA 1: Força a palavra a ficar padronizada ("ENTRADA", "entrada" vira tudo "Entrada")
    let tipoFormatado = 'Saída';
    if (tipo && tipo.toLowerCase().includes('entrada')) {
        tipoFormatado = 'Entrada';
    }

    // 1. Salva o registro no histórico de movimentações
    const sqlMov = 'INSERT INTO movimentacoes (pecaId, tipo, quantidade, data, obs) VALUES (?, ?, ?, ?, ?)';
    
    conexao.query(sqlMov, [pecaId, tipoFormatado, qtdNum, data, obs], (erro) => {
        if (erro) {
            console.error('Erro ao salvar movimentação:', erro);
            return res.status(500).json({ erro: 'Erro ao salvar no banco de dados' });
        }

        // MÁGICA 2: Faz a conta matemática direto na tabela de peças!
        let sqlEstoque = '';
        if (tipoFormatado === 'Entrada') {
            sqlEstoque = 'UPDATE pecas SET quantidade = quantidade + ? WHERE id = ?';
        } else {
            sqlEstoque = 'UPDATE pecas SET quantidade = quantidade - ? WHERE id = ?';
        }

        conexao.query(sqlEstoque, [qtdNum, pecaId], (errEstoque) => {
            if (errEstoque) {
                console.error('Erro ao atualizar quantidade da peça:', errEstoque);
                return res.status(500).json({ erro: 'Movimentação salva, mas erro ao atualizar peça' });
            }
            
            res.json({ mensagem: '✅ Movimentação registrada e estoque atualizado com sucesso!' });
        });
    });
});

// --- ROTAS DE SOLICITAÇÕES ---
app.get('/api/solicitacoes', (req, res) => {
    conexao.query('SELECT * FROM solicitacoes', (erro, resultados) => {
        if (erro) return res.status(500).json({ erro: 'Erro ao buscar solicitações' });
        res.json(resultados);
    });
});

app.post('/api/solicitacoes', (req, res) => {
    const { nomeCliente, emailCliente, telefone, veiculo, ano, placa, problema, urgencia, status, dataCriacao } = req.body;
    const sql = 'INSERT INTO solicitacoes (nomeCliente, emailCliente, telefone, veiculo, ano, placa, problema, urgencia, status, dataCriacao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    conexao.query(sql, [nomeCliente, emailCliente, telefone, veiculo, ano, placa, problema, urgencia, status, dataCriacao], (erro) => {
        if (erro) return res.status(500).json({ erro: 'Erro ao guardar solicitação' });
        res.json({ mensagem: '✅ Solicitação enviada!' });
    });
});

app.put('/api/solicitacoes/:id', (req, res) => {
    // Essa linha é CRITICAL: Ela remove o "SOL-" e deixa só o número
    const idLimpo = req.params.id.toString().replace(/\D/g, ''); 
    const { status, custoSugerido, osNumero } = req.body;

    const sql = 'UPDATE solicitacoes SET status = ?, custoSugerido = COALESCE(?, custoSugerido), osNumero = COALESCE(?, osNumero) WHERE id = ?';
    conexao.query(sql, [status, custoSugerido || null, osNumero || null, idLimpo], (erro) => {
        if (erro) {
            console.error('Erro no SQL:', erro);
            return res.status(500).json({ erro: 'Erro ao atualizar no banco' });
        }
        res.json({ mensagem: '✅ Atualizado com sucesso!' });
    });
});

app.delete('/api/solicitacoes/:id', (req, res) => {
    // Limpa o ID para garantir que é apenas número
    const idLimpo = req.params.id.toString().replace(/\D/g, ''); 
    
    conexao.query('DELETE FROM solicitacoes WHERE id = ?', [idLimpo], (erro) => {
        if (erro) {
            console.error('Erro ao apagar solicitação:', erro);
            return res.status(500).json({ erro: 'Erro ao apagar do banco' });
        }
        res.json({ mensagem: '✅ Solicitação apagada com sucesso!' });
    });
});



// Rota para EDITAR uma peça existente
app.put('/api/pecas/:id', (req, res) => {
    const { id } = req.params;
    const { nome, categoria, localizacao, quantidade, min, preco } = req.body;
    const sql = 'UPDATE pecas SET nome = ?, categoria = ?, localizacao = ?, quantidade = ?, min = ?, preco = ? WHERE id = ?';
    
    conexao.query(sql, [nome, categoria, localizacao, quantidade, min, preco, id], (erro) => {
        if (erro) {
            console.error('Erro ao atualizar peça:', erro);
            return res.status(500).json({ erro: 'Erro ao atualizar a peça' });
        }
        res.json({ mensagem: '✅ Peça atualizada com sucesso!' });
    });
});

app.listen(porta, () => {
    console.log(`🚀 Servidor a rodar na porta ${porta}`);
});