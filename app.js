const express = require('express');
const path = require('path');
const oracledb = require('oracledb');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const axios = require('axios');
const request = require('request');
const puppeteer = require('puppeteer');
const fs = require('fs');

const app = express();
app.set('view engine', 'ejs');

// 세션 설정
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: false
}));

// Passport 초기화 및 세션 사용 설정
app.use(passport.initialize());
app.use(passport.session());

const symbolsFilePath = 'views\\stock_symbol.json';
const stockNameFilePath = 'views\\stock_name.json';
let symbolMap = {};

// JSON 파일 읽기
fs.readFile(symbolsFilePath, 'utf8', (err, data) => {
  if (err) {
    console.error('Failed to read symbols JSON file:', err);
    return;
  }
  // JSON 문자열을 JavaScript 객체로 파싱
  symbolMap = JSON.parse(data);
});

// Oracle DB 연결 정보
const dbConfig = {
    user: 'system',
    password: '1234',
    connectString: 'localhost:1521/xe' // Oracle 서비스명
};

// 이메일 보내기에 사용할 SMTP 설정
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'moto73168@gmail.com', // 이메일 계정
        pass: 'vnqz nuls jucl nzkb' // 이메일 계정의 앱 비밀번호
    }
});

async function getStockInfo(symbol) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(`https://finance.naver.com/item/sise_day.naver?code=${symbol}`);

    // 예시: 종목명과 현재가를 가져오는 코드
    const currentPrice = await page.$eval('body > table.type2 > tbody > tr:nth-child(3) > td:nth-child(2) > span', element => element.innerText);

    await browser.close();

    return {
        symbol: symbol,
        price: currentPrice
    };
}

// 사용자 인증을 위한 LocalStrategy 설정
passport.use(new LocalStrategy(
    function(username, password, done) {
        // 사용자 인증 로직 구현
        // 예를 들어, 데이터베이스에서 사용자 정보를 조회하여 인증
        User.findOne({ username: username }, function (err, user) {
            if (err) { return done(err); }
            if (!user) { return done(null, false); }
            if (!user.verifyPassword(password)) { return done(null, false); }
            return done(null, user);
        });
    }
));

// Passport에 사용자 정보를 저장하는 메서드
passport.serializeUser(function(user, done) {
    done(null, user.id);
});

// Passport에서 사용자 정보를 가져오는 메서드
passport.deserializeUser(function(id, done) {
    User.findById(id, function (err, user) {
        done(err, user);
    });
});

// JSON 파싱을 위한 미들웨어 추가
app.use(bodyParser.json());

app.set('port', process.env.PORT || 3000);

app.use(express.urlencoded({ extended : true}));
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));


// 메인 페이지 렌더링
app.get('/', (req, res) => {
    // 사용자 정보가 세션에 존재하는지 확인하고 렌더링
    res.render('main', { userId: req.session.user ? req.session.user.username : null });
});
app.get('/login', (req, res) => {
    res.render('login');
});
app.get('/signin', (req, res) => {
    res.render('signin');
});
app.get('/find_id', (req, res) => {
    res.render('find_id');
});
app.get('/reset_password', (req, res) => {
    res.render('reset_password');
});
app.get('/reset-password/:temporaryPassword', (req, res) => {
    const { temporaryPassword } = req.params;
    res.render('reset-password', { temporaryPassword });
});
// 로그아웃 라우트
app.get('/logout', (req, res) => {
    req.logout(function(err) {
        if (err) {
            console.error('로그아웃 중 오류 발생:', err);
            res.status(500).json({ message: '로그아웃 중 오류 발생했습니다.' });
        } else {
            // 세션에서 사용자 정보 삭제
            req.session.user = null;
            // 메인 페이지로 리다이렉트
            res.redirect('/');
        }
    });
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
            // 세션에 사용자 정보 설정
            req.session.user = { username };
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

// 아이디 찾기 엔드포인트
app.post('/find-username', async (req, res) => {
    const { email } = req.body;
    console.log(email);
    
    try {
        // Oracle DB 연결
        const connection = await oracledb.getConnection(dbConfig);
    
        // 이메일을 기반으로 사용자 검색을 위한 SQL 쿼리 생성
        const query = `SELECT username FROM users WHERE email = :email`;
        const bindParams = { email };
        console.log(bindParams);
    
        // 쿼리 실행
        const result = await connection.execute(query, bindParams);

        // 연결 닫기
        await connection.close();
        // 결과 확인 및 응답
        if (result.rows.length > 0) {
            let usernames = [];
            for(let i=0; i<result.rows.length; i++){
                usernames.push(result.rows[i][0]); // 각 행의 첫 번째 열(아이디)을 배열에 추가
            }
            console.log(usernames);
            res.status(200).json({ usernames });
        } else {
            res.status(404).json({ message: '일치하는 이메일을 가진 사용자를 찾을 수 없습니다.' });
        }
    } catch (error) {
        console.error('아이디 찾기 중 오류 발생:', error);
        res.status(500).json({ message: '아이디 찾기 실패' });
    }
});

// 비밀번호 재설정 요청을 처리하는 엔드포인트
app.post('/reset-password', async (req, res) => {
    const { username, email } = req.body;

    // 임시 비밀번호 생성 함수
    function generateTemporaryPassword(length) {
        const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let temporaryPassword = "";
        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * charset.length);
            temporaryPassword += charset[randomIndex];
        }
        return temporaryPassword;
    };

    try {
        // 임시 비밀번호 생성
        const temporaryPassword = generateTemporaryPassword(10);

        // Oracle DB 연결
        const connection = await oracledb.getConnection(dbConfig);

        const query = `UPDATE users SET temporaryPassword = :temporaryPassword WHERE username = :username AND email = :email`;
        const bindParams = { temporaryPassword: temporaryPassword, username: username, email: email };
        const result = await connection.execute(query, bindParams);

        await connection.commit();
        // 임시 비밀번호가 업데이트되었는지 확인
        if (result.rowsAffected && result.rowsAffected === 1) {
            // 이메일 내용 구성
            const mailOptions = {
                from: 'moto73168@gmail.com',
                to: 'sjq65897245@gmail.com', // 수신자 이메일 주소를 사용자가 입력한 이메일로 설정
                subject: '비밀번호 재설정 링크',
                text: `안녕하세요, ${username}님. 비밀번호를 재설정하려면 다음 링크를 클릭하세요: http://localhost:3000/reset-password/${temporaryPassword}`
            };

            // 이메일 보내기
            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error('이메일 전송에 실패했습니다:', error);
                    res.status(500).json({ message: '이메일 전송에 실패했습니다.' });
                } else {
                    console.log('이메일이 성공적으로 전송되었습니다:', info.response);
                    res.status(200).json({ message: '이메일이 성공적으로 전송되었습니다.' });
                }
            });
        } else {
            res.status(404).json({ message: '일치하는 사용자가 없습니다.' });
        }
    } catch (error) {
        console.error('비밀번호 재설정 중 오류 발생:', error);
        res.status(500).json({ message: '비밀번호 재설정 중 오류가 발생했습니다.' });
    }
});



// 비밀번호 변경 요청 엔드포인트
app.post('/new-password', async (req, res) => {
    try {
        // 클라이언트에서 요청 본문으로부터 새 비밀번호를 받습니다.
        const { newPassword } = req.body;

        // 클라이언트에서 요청 URL로부터 사용자 이름을 받습니다.
        const { temporaryPassword } = req.body;
        console.log(newPassword, temporaryPassword)
        // Oracle DB에 연결합니다.
        const connection = await oracledb.getConnection(dbConfig);

        // 새 비밀번호를 데이터베이스에 업데이트하는 SQL 쿼리를 작성합니다.
        const query = `UPDATE users SET password = :newPassword WHERE temporaryPassword = :temporaryPassword`;

        // 쿼리 실행에 필요한 바인드 변수를 설정합니다.
        const bindParams = { newPassword, temporaryPassword };
        console.log(bindParams);

        // 쿼리 실행
        const result = await connection.execute(query, bindParams);

        // 트랜잭션 커밋
        await connection.commit();

        // 변경된 비밀번호가 성공적으로 업데이트되었는지 확인합니다.
        if (result.rowsAffected && result.rowsAffected === 1) {
            res.status(200).json({ message: '비밀번호가 성공적으로 변경되었습니다.' });
        } else {
            res.status(500).json({ message: '비밀번호 변경에 실패했습니다.' });
        }
    } catch (error) {
        console.error('비밀번호 변경 중 오류 발생:', error);
        res.status(500).json({ message: '비밀번호 변경 중 오류가 발생했습니다.' });
    }
});

app.post('/exchange-rates', (req, res) => {
    const apiKey = '5f6a9040d78420e3182fbcf4'; // ExchangeRate-API에서 발급받은 API 키

    // 요청 본문에서 기준 통화와 대상 통화를 가져옵니다.
    const { baseCurrency, targetCurrency } = req.body;
    console.log(baseCurrency)

    // ExchangeRate-API에 요청을 보내는 URL을 생성합니다.
    const url = `https://v6.exchangerate-api.com/v6/${apiKey}/pair/${baseCurrency}/${targetCurrency}`;

    // 요청을 보냅니다.
    request.get({
        url: url,
        json: true,
        headers: { 'User-Agent': 'request' }
    }, (err, response, data) => {
        if (err) {
            console.error('Error:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        } else if (response.statusCode !== 200) {
            console.error('Status:', response.statusCode);
            res.status(response.statusCode).json({ error: 'Failed to fetch exchange rates' });
        } else {
            const rate = data.conversion_rate;
            console.log('Exchange rate:', rate);
            console.log('Base currency:', data.base_code);
            console.log('Target currency:', data.target_code);
            console.log('Last update:', data.time_last_update_utc);
            // 가져온 환율 정보를 응답합니다.
            res.json({ rate: rate, base: baseCurrency, target: targetCurrency });
        }
    });
});

app.post('/stock', async (req, res) => {
    try {
        const { symbol } = req.body;
        console.log(symbol)
        const companyName = symbolMap[symbol];
        console.log(companyName)
        const stockInfo = await getStockInfo(symbol);
        stockInfo.symbol = companyName;
        res.json(stockInfo);
        console.log(stockInfo);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to get stock information' });
    }
});

app.listen(app.get('port'), () => {
    console.log(app.get('port'), '번 포트에서 대기중');
});