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
const { error } = require('console');

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
const symbolsFilePathCurrency = 'views\\currency_symbol.json';
let symbolMap = {};
let currencyMap = {};

// JSON 파일을 읽어오는 함수
function readJSONFile(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('JSON 파일을 읽는 도중 에러가 발생했습니다:', error);
        return null;
    }
}

// JSON 파일 읽기
fs.readFile(symbolsFilePath, 'utf8', (err, data) => {
  if (err) {
    console.error('Failed to read symbols JSON file:', err);
    return;
  }
  // JSON 문자열을 JavaScript 객체로 파싱
  symbolMap = JSON.parse(data);
});

// JSON 파일 읽기
fs.readFile(symbolsFilePathCurrency, 'utf8', (err, data) => {
    if (err) {
      console.error('Failed to read symbols JSON file:', err);
      return;
    }
    // JSON 문자열을 JavaScript 객체로 파싱
    currencyMap = JSON.parse(data);
});

// JSON 파일을 읽고 해당 나라의 심볼을 찾아 응답하는 함수
function findCurrencySymbol(query, callback) {
    // JSON 파일 경로 설정
    const filePath = path.join(__dirname, './views/currency_name.json');

    // JSON 파일에서 데이터 읽기
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('JSON 파일을 읽는 도중 오류가 발생했습니다:', err);
            return callback(new Error('서버 오류: JSON 파일을 읽을 수 없습니다.'));
        }

        // JSON 데이터 파싱
        const currencyData = JSON.parse(data);

        // 주어진 나라에 해당하는 심볼 찾기
        const symbol = currencyData[query];

        if (!symbol) {
            return callback(new Error('주어진 나라에 대한 심볼을 찾을 수 없습니다.'));
        }

        // 찾은 심볼을 콜백 함수에 전달
        callback(null, symbol);
    });
};

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
async function getExchangeRate(baseCurrency, targetCurrency) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    const target = baseCurrency + targetCurrency;
    await page.goto(`https://finance.naver.com/marketindex/exchangeDailyQuote.nhn?marketindexCd=FX_${target}`);

    // 환율 정보 가져오기
    const exchangeRateBuyElement = await page.$('body > div > table > tbody > tr:nth-child(1) > td:nth-child(4)');
    const exchangeRateSellElement = await page.$('body > div > table > tbody > tr:nth-child(1) > td:nth-child(5)');    

    const exchangeRateBuy = await page.evaluate(element => element.textContent, exchangeRateBuyElement);
    const exchangeRateSell = await page.evaluate(element => element.textContent, exchangeRateSellElement);

    // 공백과 개행 문자를 제거하고 숫자와 소수점만 남깁니다.
    const cleanBuyText = exchangeRateBuy.replace(/[^\d.]/g, '');
    const cleanSellText = exchangeRateSell.replace(/[^\d.]/g, '');

    // 소수점 이하를 제거하고 정수로 변환합니다.
    const buyRate = parseInt(cleanBuyText, 10);
    const sellRate = parseInt(cleanSellText, 10);

    // 결과를 객체로 반환합니다.
    const result = {
        symbol : baseCurrency,
        buy: buyRate,
        sell: sellRate
    };
    await browser.close();
    return result;
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
    // 사용자 정보가 세션에 존재하는지 확인하고 사용자 이름과 돈 정보를 렌더링
    const userData = req.session.user;
    res.render('main', { userId: userData ? userData.username : null, money: userData ? userData.money : null });
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
app.get('/stock_search', (req, res) => {
    // 사용자 정보가 세션에 존재하는지 확인하고 사용자 이름과 돈 정보를 렌더링
    const userData = req.session.user;
    res.render('stock', { userId: userData ? userData.username : null, money: userData ? userData.money : null });
});
app.get('/currency_search', (req, res) => {
    const userData = req.session.user;
    res.render('currency_search', { userId: userData ? userData.username : null, money: userData ? userData.money : null });
})
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
app.get('/stock_transaction', (req, res) => {
    const userData = req.session.user;
    res.render('stock_transaction', { userId: userData ? userData.username : null, money: userData ? userData.money : null });
});
app.get('/currency_transaction', (req, res) => {
    const userData = req.session.user;
    res.render('currency_transaction', { userId: userData ? userData.username : null, money: userData ? userData.money : null });
});
app.get('/best_earner', (req, res) => {
    const userData = req.session.user;
    res.render('best_earner', { userId: userData ? userData.username : null, money: userData ? userData.money : null });
});
app.get('/richest_person', (req, res) => {
    const userData = req.session.user;
    res.render('richest_person', { userId: userData ? userData.username : null, money: userData ? userData.money : null });
});
app.get('/myInfo', (req, res) => {
    const userData = req.session.user;
    res.render('myInfo', { userId: userData ? userData.username : null });
});
app.get('/myAsset', (req, res) => {
    const userData = req.session.user;
    res.render('myAsset', { userId: userData ? userData.username : null, money: userData ? userData.money : null });
});
app.get('/lottery', (req, res) => {
    const userData = req.session.user;
    res.render('lottery', { userId: userData ? userData.username : null, money: userData ? userData.money : null });
});
app.get('/roulette', (req, res) => {
    const userData = req.session.user;
    res.render('roulette', { userId: userData ? userData.username : null, money: userData ? userData.money : null });
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
            const connection = await oracledb.getConnection(dbConfig);

            const moneyQuery = `SELECT money FROM users WHERE username = :username AND password = :password`;
            const moneyResult = await connection.execute(moneyQuery, bindParams);

            const money = moneyResult.rows[0][0];
            await connection.close();
            // 세션에 사용자 정보 설정
            req.session.user = { username, money };
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

app.post('/stock_search', async (req, res) => {
    const query = req.body.query; // 클라이언트로부터 받은 검색어

    // JSON 파일에서 주식 데이터를 읽어옴
    const stocks = readJSONFile('./views/stock_name.json');
    const stocksArray = Object.keys(stocks).map(key => ({ name: key, symbol: stocks[key] }));
    if (!stocks) {
        res.status(500).json({ error: '서버 오류: 주식 데이터를 읽을 수 없습니다.' });
        return;
    }

    // 주식 데이터에서 검색어와 비슷한 주식을 찾음
    const foundStocks = stocksArray.filter(stock => stock.name.includes(query));

    if (foundStocks.length > 0) {
        // 비슷한 주식이 있으면 해당 주식 정보를 응답으로 전송
        const stockInfoPromises = foundStocks.map(async stock => {
            const info = await getStockInfo(stock.symbol);
            return {
                ...stock,
                symbol : info.symbol,
                price: info.price+'원'
            };
        });

        // Promise.all을 사용하여 모든 주식 정보를 한 번에 얻습니다.
        Promise.all(stockInfoPromises)
            .then(stockInfoArray => {
                res.json(stockInfoArray);
            })
            .catch(error => {
                console.error('주식 정보를 가져오는 중 에러 발생:', error);
                res.status(500).json({ error: '주식 정보를 가져오는 중 에러가 발생했습니다.' });
            });
    } else {
        // 비슷한 주식이 없으면 클라이언트에게 에러 메시지를 전송
        res.status(404).json({ error: '일치하는 주식을 찾을 수 없습니다.' });
    }
});

app.post('/stock_transaction_search', async (req, res) => {
    const query = req.body.query; // 클라이언트로부터 받은 검색어

    try {
        if(!symbolMap[query]){
            throw new Error('주식이 존재하지 않습니다.');
        }
        // 검색된 주식 심볼에 해당하는 주식 정보를 가져옴
        const stockInfo = await getStockInfo(query);
        const companyName = symbolMap[query];
        stockInfo.companyName = companyName;

        // 클라이언트에게 주식 정보를 응답으로 전송
        res.json(stockInfo);
        console.log(stockInfo);
    } catch (error) {
        console.error('주식 정보를 가져오는 중 에러 발생:', error);
        res.status(500).json({ error: error.message});
    }
});

app.post('/buy_stock', async (req, res) => {
    try {
        const connection = await oracledb.getConnection(dbConfig);

        const { stock, quantity, price } = req.body; // 클라이언트에서 전송된 심볼과 수량을 추출합니다.
        const username = req.session.user.username;

        // 주식 보유 테이블에서 해당 사용자의 해당 주식 보유 수량을 조회합니다.
        const querySelect = 'SELECT quantity FROM stock_holdings WHERE username = :username AND stock = :stock';
        const resultSelect = await connection.execute(querySelect, { username: username, stock: stock });

        if (resultSelect.rows.length === 0) {
            // 사용자가 해당 주식을 보유하고 있지 않은 경우, 새로운 레코드를 추가합니다.
            const queryInsert = 'INSERT INTO stock_holdings (username, stock, quantity) VALUES (:username, :stock, :quantity)';
            const resultInsert = await connection.execute(queryInsert, { username: username, stock: stock, quantity: quantity });
        } else {
            // 사용자가 이미 해당 주식을 보유하고 있는 경우, 보유 수량을 늘립니다.
            const currentQuantity = resultSelect.rows[0][0]; // 현재 보유 수량
            const updatedQuantity = currentQuantity + quantity;

            // 주식 보유 테이블에서 보유 수량을 업데이트합니다.
            const queryUpdate = 'UPDATE stock_holdings SET quantity = :updatedQuantity WHERE username = :username AND stock = :stock';
            await connection.execute(queryUpdate, { updatedQuantity: updatedQuantity, username: username, stock: stock });

            await connection.commit();
        }

        // 사용자 테이블에서 현재 사용자의 돈을 조회합니다.
        const queryUser = 'SELECT money FROM users WHERE username = :username';
        const resultUser = await connection.execute(queryUser, { username: username });
        const currentMoney = resultUser.rows[0][0]; // 현재 사용자의 돈

        // 사용자 테이블에서 현재 사용자의 돈을 업데이트합니다.
        const updatedMoney = currentMoney - price * quantity;
        req.session.user.money = updatedMoney;
        const queryUpdateMoney = 'UPDATE users SET money = :updatedMoney WHERE username = :username';
        await connection.execute(queryUpdateMoney, { updatedMoney: updatedMoney, username: username });

        const queryTrade_count = 'UPDATE users SET transaction_count = transaction_count + 1 WHERE username = :username'
        await connection.execute(queryTrade_count, { username : username });

        await connection.commit();
        await connection.close();

        // 데이터베이스에 성공적으로 주식 정보를 저장했을 경우 클라이언트에 응답합니다.
        res.status(200).json({ message: '주식을 성공적으로 구매했습니다.' });
    } catch (error) {
        // 오류 발생 시 클라이언트에 에러 메시지를 응답합니다.
        console.error('주식 구매 중 오류 발생:', error);
        res.status(500).json({ error: '주식 구매 중 오류가 발생했습니다.' });
    }
});

app.post('/sell_stock', async (req, res) => {
    try {
        const connection = await oracledb.getConnection(dbConfig);

        const username = req.session.user.username;
        const { stock, price, quantity } = req.body; // 클라이언트에서 전송된 사용자 이름, 주식 종목, 판매 가격을 추출합니다.

        // 주식 보유 테이블에서 해당 사용자의 보유 주식 수를 조회합니다.
        const querySelect = 'SELECT quantity FROM stock_holdings WHERE username = :username AND stock = :stock';
        const resultSelect = await connection.execute(querySelect, { username: username, stock: stock });
        
        if (resultSelect.rows.length === 0) {
            throw new Error('해당 주식을 보유하고 있지 않습니다.');
        }

        const stockQuantity = resultSelect.rows[0][0]; // 조회된 주식의 수

        if (quantity <= 0) {
            throw new Error('판매할 주식의 수량을 0보다 크게 입력하세요.');
        }

        if (stockQuantity < quantity) {
            throw new Error('보유 중인 주식보다 많은 양을 선택하셨습니다.');
        }

        // 주식 판매 후 주식 보유 테이블에서 해당 사용자의 보유 주식 수량을 업데이트합니다.
        const updatedQuantity = stockQuantity - quantity;
        const queryUpdate = 'UPDATE stock_holdings SET quantity = :updatedQuantity WHERE username = :username AND stock = :stock';
        await connection.execute(queryUpdate, { updatedQuantity: updatedQuantity, username: username, stock: stock });

        // 사용자 테이블에서 현재 사용자의 돈을 조회합니다.
        const queryUser = 'SELECT money FROM users WHERE username = :username';
        const resultUser = await connection.execute(queryUser, { username: username });
        const currentMoney = resultUser.rows[0][0]; // 현재 사용자의 돈

        // 판매한 주식의 가격을 현재 돈에 더합니다.
        const updatedMoney = currentMoney + price * quantity;
        req.session.user.money = updatedMoney;

        // 사용자 테이블에서 현재 사용자의 돈을 업데이트합니다.
        const queryUpdateMoney = 'UPDATE users SET money = :updatedMoney WHERE username = :username';
        await connection.execute(queryUpdateMoney, { updatedMoney: updatedMoney, username: username });

        // 판매 성공 메시지를 클라이언트에 응답합니다.
        res.status(200).json({ message: '주식을 성공적으로 판매했습니다.' });
        const queryTrade_count = 'UPDATE users SET transaction_count = transaction_count + 1 WHERE username = :username'
        await connection.execute(queryTrade_count, { username : username });
        
        await connection.commit();
        await connection.close();
    } catch (error) {
        console.error('주식 판매 중 오류 발생:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/currency_search', async (req, res) => {
    try {
        // 클라이언트로부터 나라 이름을 받아옴
        const { query } = req.body;

        // 심볼을 찾고 응답을 클라이언트에 전송
        findCurrencySymbol(query, async (error, symbol) => {
            if (error) {
                console.error('오류 발생:', error.message);
                return res.status(500).json({ error: error.message });
            }

            try {
                console.log(symbol);
                const exchangeRate = await getExchangeRate(symbol, "KRW");

                // 클라이언트에게 환율 정보 전송
                res.status(200).json({ symbol: symbol, exchangeRateBuy: exchangeRate.buy, exchangeRateSell: exchangeRate.sell });
            } catch (error) {
                console.error('환율 정보를 가져오는 중 오류 발생:', error.message);
                res.status(500).json({ error: error.message });
            }
        });
    } catch (error) {
        console.error('오류 발생:', error.message);
        res.status(500).json({ error: error.message });
    }
});
app.post('/currency_transaction_search', async (req, res) => {
    const query = req.body.query; // 클라이언트로부터 받은 검색어

    try {
        if(!currencyMap[query]){
            throw new Error('외화가 존재하지 않습니다.');
        }
        // 검색된 외화 심볼에 해당하는 외화 정보를 가져옴
        const currencyInfo = await getExchangeRate(query, "KRW");
        const countryName = currencyMap[query];
        currencyInfo.countryName = countryName;

        // 클라이언트에게 외화 정보를 응답으로 전송
        res.json(currencyInfo);
        console.log(currencyInfo);
    } catch (error) {
        console.error('외화 정보를 가져오는 중 에러 발생:', error);
        res.status(500).json({ error: error.message});
    }
});

app.post('/buy_currency', async (req, res) => {
    try {
        const connection = await oracledb.getConnection(dbConfig);

        const { currency, quantity, price } = req.body; // 클라이언트에서 전송된 심볼과 수량을 추출합니다.
        const username = req.session.user.username;

        // 외화 보유 테이블에서 해당 사용자의 해당 외화 보유 수량을 조회합니다.
        const querySelect = 'SELECT quantity FROM currency_holdings WHERE username = :username AND currency = :currency';
        const resultSelect = await connection.execute(querySelect, { username: username, currency: currency });
        if (resultSelect.rows.length === 0) {
            // 사용자가 해당 외화를 보유하고 있지 않은 경우, 새로운 레코드를 추가합니다.
            const queryInsert = 'INSERT INTO currency_holdings (username, currency, quantity) VALUES (:username, :currency, :quantity)';
            const resultInsert = await connection.execute(queryInsert, { username: username, currency: currency, quantity: quantity });
            console.log(2)
        } else {
            // 사용자가 이미 해당 외화를 보유하고 있는 경우, 보유 수량을 늘립니다.
            const currentQuantity = resultSelect.rows[0][0]; // 현재 보유 수량
            const updatedQuantity = currentQuantity + quantity;

            // 외화 보유 테이블에서 보유 수량을 업데이트합니다.
            const queryUpdate = 'UPDATE currency_holdings SET quantity = :updatedQuantity WHERE username = :username AND currency = :currency';
            await connection.execute(queryUpdate, { updatedQuantity: updatedQuantity, username: username, currency: currency });

            await connection.commit();
        }

        // 사용자 테이블에서 현재 사용자의 돈을 조회합니다.
        const queryUser = 'SELECT money FROM users WHERE username = :username';
        const resultUser = await connection.execute(queryUser, { username: username });
        const currentMoney = resultUser.rows[0][0]; // 현재 사용자의 돈

        // 사용자 테이블에서 현재 사용자의 돈을 업데이트합니다.
        const updatedMoney = currentMoney - price * quantity;
        req.session.user.money = updatedMoney;
        const queryUpdateMoney = 'UPDATE users SET money = :updatedMoney WHERE username = :username';
        await connection.execute(queryUpdateMoney, { updatedMoney: updatedMoney, username: username });

        const queryTrade_count = 'UPDATE users SET transaction_count = transaction_count + 1 WHERE username = :username'
        await connection.execute(queryTrade_count, { username : username });
        
        await connection.commit();
        await connection.close();

        // 데이터베이스에 성공적으로 주식 정보를 저장했을 경우 클라이언트에 응답합니다.
        res.status(200).json({ message: '외화 성공적으로 구매했습니다.' });
        console.log(req.session.user.money);
    } catch (error) {
        // 오류 발생 시 클라이언트에 에러 메시지를 응답합니다.
        console.error('외화 구매 중 오류 발생:', error);
        res.status(500).json({ error: '외화 구매 중 오류가 발생했습니다.' });
    }
});

app.post('/sell_currency', async (req, res) => {
    try {
        const connection = await oracledb.getConnection(dbConfig);

        const username = req.session.user.username;
        const { currency, price, quantity } = req.body; // 클라이언트에서 전송된 사용자 이름, 외화, 판매 가격을 추출합니다.

        // 외화 보유 테이블에서 해당 사용자의 보유 외화 수를 조회합니다.
        const querySelect = 'SELECT quantity FROM currency_holdings WHERE username = :username AND currency = :currency';
        const resultSelect = await connection.execute(querySelect, { username: username, currency: currency });
        
        if (resultSelect.rows.length === 0) {
            throw new Error('해당 외화를 보유하고 있지 않습니다.');
        }

        const stockQuantity = resultSelect.rows[0][0]; // 조회된 외화의 수

        if (quantity <= 0) {
            throw new Error('판매할 외화의 수량을 0보다 크게 입력하세요.');
        }

        if (stockQuantity < quantity) {
            throw new Error('보유 중인 외화보다 많은 양을 선택하셨습니다.');
        }

        // 외화 판매 후 외화 보유 테이블에서 해당 사용자의 보유 외화 수량을 업데이트합니다.
        const updatedQuantity = stockQuantity - quantity;
        const queryUpdate = 'UPDATE currency_holdings SET quantity = :updatedQuantity WHERE username = :username AND currency = :currency';
        await connection.execute(queryUpdate, { updatedQuantity: updatedQuantity, username: username, currency: currency });

        // 사용자 테이블에서 현재 사용자의 돈을 조회합니다.
        const queryUser = 'SELECT money FROM users WHERE username = :username';
        const resultUser = await connection.execute(queryUser, { username: username });
        const currentMoney = resultUser.rows[0][0]; // 현재 사용자의 돈

        // 판매한 외화의 가격을 현재 돈에 더합니다.
        const updatedMoney = currentMoney + price * quantity;
        req.session.user.money = updatedMoney;

        // 사용자 테이블에서 현재 사용자의 돈을 업데이트합니다.
        const queryUpdateMoney = 'UPDATE users SET money = :updatedMoney WHERE username = :username';
        await connection.execute(queryUpdateMoney, { updatedMoney: updatedMoney, username: username });

        // 판매 성공 메시지를 클라이언트에 응답합니다.
        res.status(200).json({ message: '외화를 성공적으로 판매했습니다.' });

        const queryTrade_count = 'UPDATE users SET transaction_count = transaction_count + 1 WHERE username = :username'
        await connection.execute(queryTrade_count, { username : username });
        
        await connection.commit();
        await connection.close();
        console.log(req.session.user.money);
    } catch (error) {
        console.error('외화 판매 중 오류 발생:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/best_earner', async (req, res) => {
    try {
        const connection = await oracledb.getConnection(dbConfig);

        // 사용자별 거래 횟수와 거래로 얻은 이익, 초기 자금을 조회합니다.
        const query = `
            SELECT 
                username, 
                transaction_count, 
                CASE 
                    WHEN transaction_count = 0 THEN money - 100000
                    ELSE (money - 100000) / transaction_count
                END AS total_profit
            FROM 
                users
            ORDER BY 
                total_profit DESC
            FETCH FIRST 10 ROWS ONLY
        `;
        const result = await connection.execute(query);

        const data = result.rows.map(row => {
            const username = row[0];
            const numTransactions = row[1];
            const totalProfit = row[2];
            let profitPerTransaction
            if(numTransactions==0 || totalProfit==0){
                profitPerTransaction = 0
            }
            else{
                profitPerTransaction = totalProfit/numTransactions;
            }
            return [username, numTransactions, totalProfit, profitPerTransaction];
        });

        await connection.close();

        // 클라이언트에 결과를 전송합니다.
        res.status(200).json({ data: data });
        console.log(data);
    } catch (error) {
        console.error('역대 최고의 수익자 조회 중 오류 발생:', error);
        res.status(500).json({ error: '역대 최고의 수익자 조회 중 오류가 발생했습니다.' });
    }
});

app.post('/richest_person', async (req, res) => {
    try {
        const connection = await oracledb.getConnection(dbConfig);

        // 사용자 테이블에서 돈을 기준으로 내림차순으로 정렬하여 상위 10명의 이름과 돈을 가져옵니다.
        const query = `
            SELECT username, money
            FROM (
                SELECT username, money, ROW_NUMBER() OVER (ORDER BY money DESC) AS rank
                FROM users
            )
            WHERE rank <= 10
        `;
        const result = await connection.execute(query);

        await connection.close();

        // 결과를 클라이언트에 응답합니다.
        res.status(200).json({ data: result.rows });
        console.log(result.rows)
    } catch (error) {
        console.error('데이터베이스 조회 중 오류 발생:', error);
        res.status(500).json({ error: '데이터베이스 조회 중 오류가 발생했습니다.' });
    }
});
app.post('/myInfo', async (req, res) => {
    try {
        const connection = await oracledb.getConnection(dbConfig);

        const { name } = req.body;
        console.log(name);
        
        const query = `SELECT * FROM users WHERE username = :name`;
        const bindParams = {name : name};
        
        const result = await connection.execute(query, bindParams);
        res.status(200).json({username : result.rows[0][1], email : result.rows[0][2], money : result.rows[0][4], transaction_count : result.rows[0][5]})
    } catch (error) {
        console.error('데이터베이스 조회 중 오류 발생:', error);
        res.status(500).json({ error: '데이터베이스 조회 중 오류가 발생했습니다.' });
    }
});

app.post('/myAsset', async (req, res) => {
    try {
        const connection = await oracledb.getConnection(dbConfig);

        const { name } = req.body;
        console.log(name);
        
        const query = `SELECT * FROM stock_holdings WHERE username = :name`;
        const bindParams = {name : name};

        const query2 = `SELECT * FROM currency_holdings WHERE username = :name`;
        const bindParams2 = {name : name};
        
        const result = await connection.execute(query, bindParams);
        const result2 = await connection.execute(query2, bindParams2);
        console.log(result.rows);
        console.log(result2.rows);

        const stockList = []
        const currencyList = []
        result.rows.forEach(element => {
            if(element[2] > 0){
                stockList.push({stock : element[1], quantity : element[2]});
            }
        });
        result2.rows.forEach(element => {
            if(element[2] > 0){
                currencyList.push({currency : element[1], quantity : element[2]});
            }
        });
        console.log(stockList, currencyList);

        res.status(200).json({stockList : stockList, currencyList : currencyList});
    } catch (error) {
        console.error('데이터베이스 조회 중 오류 발생:', error);
        res.status(500).json({ error: '데이터베이스 조회 중 오류가 발생했습니다.' });
    }
});
// 복권 구매 요청을 받는 엔드포인트
app.post('/buyLottery', async (req, res) => {
    try{
        const connection = await oracledb.getConnection(dbConfig);
        
        const { username, money, number } = req.body;
        console.log(username, money, number);

        const queryUpdateMoney = 'UPDATE users SET money = :updatedMoney WHERE username = :username';
        await connection.execute(queryUpdateMoney, { updatedMoney: (money-1000) , username: username });
        req.session.user.money -= 1000;

        const updatequery = 'UPDATE users SET transaction_count = transaction_count + 1 WHERE username = :username';
        await connection.execute(updatequery, {username : username});

        await connection.commit();
        const randomNumber = Math.floor(Math.random() * 1000);
        if(randomNumber == number){
            const query = 'UPDATE users SET money = :updatedMoney WHERE username = :username'
            const bindParams = {updatedMoney : (money + 100000), username : username};
            req.session.user.money += 1000000

            await connection.execute(query, bindParams);

            res.status(200).json('당첨!');
        }
        else{
            res.status(200).json('실패...');
        }

        await connection.commit();
        await connection.close();
    }
    catch(error) {
        console.error('데이터베이스 조회 중 오류 발생:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/winning_ratio', async (req, res) => {
    try {
        const connection = await oracledb.getConnection(dbConfig);

        let { username, ratio } = req.body;
        ratio = parseFloat(ratio);
        console.log(username, ratio);

        const updatedMoney = req.session.user.money + (100000 * ratio) - 100000;
        const query = 'UPDATE users SET money = :updatedMoney WHERE username = :username';
        const bindParams = {updatedMoney : updatedMoney, username : username};
        req.session.user.money = updatedMoney;

        await connection.execute(query, bindParams);

        const updatequery = 'UPDATE users SET transaction_count = transaction_count + 1 WHERE username = :username';
        await connection.execute(updatequery, {username : username});

        await connection.commit();
        await connection.close();

        res.status(200).json('데이터베이스 수정 완료');
        
    } catch (error) {
        console.error('데이터베이스 조회 중 오류 발생:', error);
        res.status(500).json({ error: error.message});
    }
});

app.listen(app.get('port'), () => {
    console.log(app.get('port'), '번 포트에서 대기중');
});