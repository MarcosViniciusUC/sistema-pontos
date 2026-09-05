const express = require("express");
const userController = require("../controllers/user.controller");
const validateUser = require("../middlewares/validateUser");

const router = express.Router();

router.post("/usuarios", validateUser, userController.cadastrar);

module.exports = router;
