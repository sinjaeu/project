const express = require('express');
const path = require('path');
const oracledb = require('oracledb');
const bodyParser = require('body-parser');

const app = express();

// Oracle DB 연결 정보
const dbConfig = {
    user: 'system',
    password: '1234',
    connectString: 'localhost:1521/xe' // Oracle 서비스명
};

// JSON 파싱을 위한 미들웨어 추가
app.use(bodyParser.json());

app.set('port', process.env.PORT || 3000);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/main.html'));
});

// 회원가입 엔드포인트
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    let connection;

    try {
        // Oracle DB 연결
        connection = await oracledb.getConnection(dbConfig);

        // 이미 존재하는 사용자인지 확인
        const checkQuery = `SELECT COUNT(*) AS count FROM users WHERE username = :username`;
        const checkResult = await connection.execute(checkQuery, [username]);
        const existingUserCount = checkResult.rows[0][0];
        console.log(checkResult.rows[0][0])

        if (existingUserCount > 0) {
            console.log('들어옴')
            return res.status(400).json({ message: '중복된 아이디입니다.' });
        }

        // 회원가입 데이터 삽입을 위한 SQL 쿼리 생성
        const query = `INSERT INTO users (user_id, username, email, password) VALUES (user_id_seq.NEXTVAL, :username, :email, :password)`;
        const bindParams = { username, email, password };
        // 쿼리 실행
        const result = await connection.execute(query, bindParams);

        // 커밋 수행
        await connection.commit();
    
        // 회원가입 성공 응답
        res.status(201).json({ message: '회원가입 성공!' });
    } catch (error) {
        console.error('Error occurred while registering user:', error);
        res.status(500).json({ message: 'Failed to register user.' });
    } finally {
        // 연결 닫기
        if (connection) {
            try {
                await connection.close();
            } catch (error) {
                console.error('Error closing connection:', error);
            }
        }
    }
});

// 로그인 엔드포인트
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Oracle DB 연결
        const connection = await oracledb.getConnection(dbConfig);

        // 사용자 인증을 위한 SQL 쿼리 생성
        const query = `SELECT * FROM users WHERE username = :username AND password = :password`;
        const bindParams = { username, password };

        // 쿼리 실행
        const result = await connection.execute(query, bindParams);

        // 연결 닫기
        await connection.close();
        // 사용자가 존재하면 로그인 성공 응답
        if (result.rows.length > 0) {
            res.status(200).json({ message: '로그인 성공!' });
            console.log('로그인 성공 ' + username)
        } else {
            // 사용자가 존재하지 않으면 로그인 실패 응답
            res.status(401).json({ message: '사용자 이름 또는 비밀번호가 올바르지 않습니다.' });
            console.log('로그인 실패')
        }
    } catch (error) {
        console.error('로그인 중 오류 발생:', error);
        res.status(500).json({ message: '로그인 실패' });
    }
});

app.listen(app.get('port'), () => {
    console.log(app.get('port'), '번 포트에서 대기중');
});