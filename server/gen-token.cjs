const jwt = require('jsonwebtoken')
const secret = 'J/sz+fYHmUk0cXfuN1034/vyUhQ0MHv8KeMcoiwzo84='
const payload = { id: '3a20a7ea-42cc-4b56-bb78-976b0bb8abf6', username: 'NeVoit', role: 'admin', avatar_seed: '' }
const token = jwt.sign(payload, secret, { expiresIn: '30d' })
console.log(token)
