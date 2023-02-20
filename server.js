const express = require("express");
const sessions = require("express-session");
const cookieParser = require("cookie-parser");
const parseUrl = require("body-parser");
const path = require("path");
const mysql = require("mysql2");
const ejs = require("ejs");
const { resolve } = require("path");
const fs = require('fs');

const encodeUrl = parseUrl.urlencoded({ extended: false });

// Zmienna do łączenia z bazą danych
 // -------------------------------------------------------- //

var con = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "praca123",
    database: "userdb",
});

 // -------------------------------------------------------- //

const app = express();

app.set('view engine', 'ejs');

// Ustawienie ścieżki dla plików html, css itp.
 // -------------------------------------------------------- //

app.use(express.static(path.join(__dirname, "public")));

 // -------------------------------------------------------- //

 // Ciasteczka
// -------------------------------------------------------- //

app.use(cookieParser());
app.use(
    sessions({
        secret: "thisismysecrctekey",
        saveUninitialized: true,
        cookie: { maxAge: 1000 * 60 * 60 * 24 }, // 24 hours
        resave: false,
    })
);

 // -------------------------------------------------------- //

// localhost:4000 (Jeśli użytkownik zalogowany może zobaczyć ile rzeczy ma w koszyku)
 // -------------------------------------------------------- //
app.get("/", async (req, res) => {
    const user = req.session.user;

    const data = { user, cartItems: [] };
    if (user) {
        const userName = user.username;
        data.cartItems = await getUserCart(userName);
    }

    const page = await ejs.renderFile("index.ejs", data, { root: __dirname });
    return res.send(page);
});

 // -------------------------------------------------------- //

 // localhost:4000/dashboard (Panel dla administratora)
  // -------------------------------------------------------- //
app.get("/dashboard_admin", async (req, res) => {
    const user = req.session.user;

    const data = { user, cartItems: [] };

    if (user) {
        const userName = user.username;
        data.cartItems = await getUserCart(userName);
    }

    const page = await ejs.renderFile("dashboard_admin.ejs", data, { root: __dirname});
    return res.send(page);
});

 // -------------------------------------------------------- //

 // Wyświetlenie użytkowników w panelu administratora
 // -------------------------------------------------------- //

app.get("/user_dashboard", (req, res) => {
    con.query("SELECT * FROM users", (err, users) => {
        if (err) {
            console.log(err);
        } else {
            res.render("user_dashboard", { users: users});
            console.log(users)
        }
    })
});

 // -------------------------------------------------------- //

 // Wyświetlanie koszyka (Nie działa)
 // -------------------------------------------------------- //
 
 app.get('/show_carts:user', function(req, res) {
    const user = req.params.user;
    con.query('SELECT * FROM cartitems WHERE username = ?', user, function(error, results, fields) {
      if (error) throw error;
      res.render('/show_carts.ejs', { show_carts: results, user: user  });
    });
  });

  // -------------------------------------------------------- //

// Edytowanie użytkownika
// -------------------------------------------------------- //

app.get('/edit_user/id', function(req, res)  {
    const id = req.params.id;
    const query = 'SELECT * FROM users WHERE id = ?';
    con.query(query, [id], function(error, results) {
        if (error) throw error;
        const user = result[0];
        res.render('edit_user', { user });
    });
});

app.post('/edit_user/:id', function (req, res)  {
   const id = req.params.id;
   const firstname = req.params.firstname;
   const lastname = req.params.lastname;
   const username = req.params.username;
   const password = req.params.password;
   const rolee = req.params.rolee;
   
   const query = 'UPDATE users SET firstname = ?, lastname = ?, username = ?, password = ?, rolee = ? WHERE id = ?';
   con.query(query, [firstname, lastname, username, password, id], function (error, results) {
    if (error) throw error;
    res.redirect('/user_dashboard');
   });
});

// -------------------------------------------------------- //

// Registration
app.post("/register", encodeUrl, (req, res) => {
    const firstName = req.body.firstName;
    const lastName = req.body.lastName;
    const userName = req.body.userName;
    const password = req.body.password;

    con.connect(async (err) => {
        if (err) return res.send(renderError("Błąd serwera"));

        const user = await getUser(userName);

        // Check if user already exists
        if (user) return res.send(renderError("Użytkownik już istnieje"));

        // Create user
        const created = await createUser(firstName, lastName, userName, password);
        if (!created) return res.send(renderError("Nie udało się utworzyć użytkownika"));

        // Create user session
        req.session.user = {
            firstname: firstName,
            lastname: lastName,
            username: userName,
            password: password,
            rolee: 'user',
        };

        return res.redirect("/");
    });
});

// Authentication
app.post("/login", encodeUrl, (req, res) => {
    const userName = req.body.userName;
    const password = req.body.password;

    con.connect(async (err) => {
        if (err) return res.send(renderError("Błąd serwera"));

        const user = await getUser(userName);

        // User does not exist
        if (!user) return res.send(renderError("Użytkownik nie istnieje"));

        // Incorrect password
        if (user.password !== password)
            return res.send(renderError("Użytkownik nie istnieje"));

        // Create user session
        req.session.user = {
            firstname: user.firstName,
            lastname: user.lastName,
            username: userName,
            password: password,
            rolee: user.rolee,
        };

        return res.redirect("/");
    })
});

app.post('/login', express.urlencoded({ extended: false }), function (req, res) {
    // login logic to validate req.body.user and req.body.pass
    // would be implemented here. for this example any combo works
  
    // regenerate the session, which is good practice to help
    // guard against forms of session fixation
    req.session.regenerate(function (err) {
      if (err) next(err)
  
      // store user information in session, typically a user id
      user = req.body.user
  
      // save the session before redirection to ensure page
      // load does not happen before session is saved
      req.session.save(function (err) {
        if (err) return next(err)
        res.redirect('/')
      })
    })
  })

  app.get('/logout', function (req, res, next) {
    // logout logic
  
   
    req.session.user = null
    req.session.save(function (err) {
      if (err) next(err)
  
      req.session.regenerate(function (err) {
        if (err) next(err)
        res.redirect('/')
      })
    })
  })

// Add course to cart
app.post("/cart/:course", encodeUrl, async (req, res) => {
    const courseId = req.params.course;

    con.connect(async (err) => {
        if (err) return res.send(renderError("Błąd serwera"));

        // Not authenticated
        if (!req.session.user)
            return res.send(renderError("Zaloguj się by dodawać kursy do koszyka"));

        const userName = req.session.user.username;
        const cartItems = await getUserCart(userName);

        // Check if the course is already in the cart
        const alreadyInCart = !!cartItems.find(item => item.courseid === courseId);
        if (alreadyInCart)
            return res.send(renderError("Kurs jest już w koszyku!"));

        const success = await addCourseToCart(userName, courseId);
        if (!success)
            return res.send(renderError("Nie udało się dodać kursu do koszyka"));

        return res.redirect("/");
    });
});

app.listen(4000, () => {
    console.log("Server running on port 4000");
});

//// Database helpers

function getUser(userName) {
    return new Promise(resolve => {
        con.query(`
            SELECT * FROM users
            WHERE username = '${userName}'
            LIMIT 1`,
            function (err, result) {
                if (err || !result) return resolve(null);
                if (result.length < 1) return resolve(null);
                return resolve(result[0]);
            }
        );
    });
}

function getUserCart(userName) {
    return new Promise(resolve => {
        con.query(`
            SELECT * FROM cartitems
            WHERE username = '${userName}'`,
            function (err, result) {
                if (err) return resolve([]);
                return resolve(result);
            }
        );
    });
}

function createUser(firstName, lastName, userName, password) {
    return new Promise(resolve => {
        con.query(`
            INSERT INTO users(firstname, lastname, username, password, rolee)
            VALUES('${firstName}', '${lastName}', '${userName}', '${password}', 'user')`,
            function (err, result) {
                if (err) return resolve(false);
                return resolve(true);
            }
        );
    });
}

function addCourseToCart(userName, courseId) {
    return new Promise(resolve => {
        con.query(`
            INSERT INTO cartitems(username, courseid)
            VALUES('${userName}', '${courseId}')`,
            function (err, result) {
                if (err) return resolve(false);
                return resolve(true);
            }
        );
    });
}

function getAllUser() {
    return new Promise(resolve => {
        con.query(`
        SELECT * FROM users`,
        function (err, result) {
            if (err) return resolve(false);
            return resolve(true);
        }
    );
    });
}

// Generic error screen
function renderError(description) {
    return `
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <title>Login and register form with Node.js, Express.js and MySQL</title>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
            </head>
            <body>
                <div class="container">
                    <center>
                        <h3 class="text-danger">${description}</h3>
                        <a href="/">Wróć</a>
                    </center>
                </div>
            </body>
        </html>
    `;
}