const LocalStrategy = require("passport-local").Strategy
const bcrypt = require("bcrypt")

function initialize(passport, getUserByEmail, getUserById){
    // Funkcja to autentykacji użytkowników
    const authenticateUsers = async (email, password, done) => {
        // Pobierz użytkownika po emailu
        const user = getUserByEmail(email)
        if (user == null){
            return done(null, false, {message: "Nie znaleziono uzytkownika po emailu"})
        }
        try {
            if (await bcrypt.compare(password, user.password)){
                return done(null, user)
            } else {
                return done (null, false, {message: "Nie poprawne hasło"})
            }
        } catch (e) {
            console.log(e);
            return done(e)
        }
    }

    passport.use(new LocalStrategy({usernameField: 'email'}, authenticateUsers))
    passport.serializeUser((user, done) => done (null, user.id))
    passport.deserializeUser((id, done) => {
        return done(null, getUserById(id))
    })
}
module.exports = initialize