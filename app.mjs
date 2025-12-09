import { loadSequelize } from "./database.mjs";
import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

dotenv.config();
const secretKeyJWT = process.env.JWT_SECRET;

function authenticate(req, res, next) {

    const token = req.cookies.jwt;
    if (!token)
        return res.status(401).json({ message: " non authentifié" });
    try {
        const decoded = jwt.verify(token, secretKeyJWT);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: "Token non valide" })
    }
}


async function main() {
    try {
        const { sequelize, models } = await loadSequelize();
        const { User, Post, Comment } = models;

        const app = express();
        app.use(express.json());
        app.use(cookieParser());
        app.use(cors({
            origin: true,
            credentials: true
        }));

        // ------------REGISTER-------------

        app.post("/register", async (req, res) => {
            try {
                // Récupère username, email et password de la requête utilisateur
                const { username, email, password, role } = req.body;

                // Vérifie si l'utilisateur existe déjà
                const existingUser = await User.findOne({ where: { email } });
                if (existingUser) {
                    return res.status(409).json({ message: "Email déjà utilisé" });
                }



                // Création du user/useradmin
                const user = await User.create({
                    "username": req.body.username,
                    "email": req.body.email,
                    "password": req.body.password,
                    "role": req.body.role
                });

                // Génération du JWT
                const token = jwt.sign(
                    { id: user.id, username: user.username, role: user.role },
                    secretKeyJWT,
                    { expiresIn: "7d" }
                );

                // Envoi du token dans un cookie httpOnly et sameSite lax
                res.cookie("jwt", token, {
                    httpOnly: true,
                    sameSite: "lax"
                });

                res.status(201).json({ message: "Compte créé", user: { id: user.id, username: user.username, email: user.email } });
            } catch (err) {
                console.error(err);
                res.status(500).json({ message: "Erreur serveur" });
            }
        });

        //---------------LOGIN--------------


        app.post("/login", async (req, res) => {
            try {
                // Récupère email et password de la requête utilisateur
                // const { email, password } = req.body;
                const password = req.body.password;
                const email = req.body.email;
                // on cherche l'utilisateur dans la bdd
                const user = await User.findOne({ where: { email } });
                if (!user) return res.status(400).json({ message: "Email incorrect" });
                // on compare le password avec le hash en bdd
                const valid = await bcrypt.compare(password, user.password);
                if (!valid) return res.status(400).json({ message: "Mot de passe incorrect" });
                // si tout est ok, on génère un token JWT avec les infos utilisateur
                const token = jwt.sign(
                    { id: user.id, username: user.username, role: user.role },
                    secretKeyJWT,
                    { expiresIn: "1h" }
                );
                // on envoie le token dans un cookie hhttpOnly et sameSite lax
                res.cookie("jwt", token, {
                    httpOnly: true,
                    sameSite: "lax"
                });

                res.json({ message: "Connecté", user: { id: user.id, username: user.username, email: user.email } });
            } catch (err) {
                console.error(err);
                res.status(500).json({ message: "Erreur serveur" });
            }
        });


        // ----------LOGOUT----------------

        app.post("/logout", (req, res) => {
            res.clearCookie("jwt");
            res.json({ message: "Déconnecté" });
        });

        //------création d'un post------------

        app.post("/posts", authenticate, async (req, res) => {
            try {
                if (!req.body || !req.body.title || !req.body.content) {
                    return res.status(404).json({ message: "Pour créer un post, un titre et un contenu est requis" });
                }
                await Post.create({
                    "title": req.body.title,
                    "content": req.body.content,
                    "userId" : req.user.id,
                    "createdAt": new Date()
                });
                return res.status(201).json({ message: "Post crée avec succées" });
            } catch (error) {
                return res.status(500).json({ message: "Erreur serveur" });
            }
        });


        //----Récuperation de tous les posts avec commentaire

        app.get("/posts", async (req, res) => {
            try {
                const posts = await Post.findAll({
                    include: [{ 
                        association: "User",
                        attributes: ["id", "username"]
                    }, {
                        association: "Comments",
                        include: [{
                            association: "User",
                            attributes: ["id", "username"]
                        }]
                    }]
                });
                if (!posts) {
                    return res.status(404).json({ message: "Erreur lors de la récupération des Posts" });
                }
                if (posts.length <= 0) {
                    return res.status(404).json({ message: "Aucun Post" });
                }
                return res.status(200).json(posts);
            } catch (error) {
                res.status(500).json({ message: "Erreur serveur" });
            }
        });

        // ----Récupération d'un post par ID

        app.get("/posts/:postId", async (req, res) => {
            try {
                const post = await Post.findByPk(req.params.postId, {
                    include: [{
                        association: "User",
                        attributes: ["id", "username"]
                    }, {
                        association: "Comments",
                        include: [{
                            association: "User",
                            attributes: ["id", "username"]
                        }]
                    }]
                });
                if (!post) {
                    return res.status(404).json({ message: "Post non trouvé" });
                }
                res.status(200).json(post);
            } catch (error) {
                console.error(error);
                res.status(500).json({ message: "Erreur serveur" });
                return res.status(500).json({ comment: "Erreur serveur" });
            }
        });

        //----Création d'un commentaire pour un post
        app.post("/posts/:postId/comments", async (req, res) => {
            const { postId } = req.params;
            const { content } = req.body;
            const {createdAt} = req.body;

            try {
                const comment = await Comment.create({ content, postId });
                res.status(201).json(comment);
            } catch (error) {
                console.error(error);
                res.status(500).json({ message: "Erreur serveur" });
            }
        });

        // ---suppresion d'un post------
        app.delete("/posts/:postId", authenticate, async (req, res) => {
            try {
                // je recupère le post à supprimer depuis les paramètres de la requête
                const post = await Post.findByPk(req.params.postId);
                if (!post) {
                    return res.status(404).json({ message: "Post non trouvé" });
                }
                // si l'utilisateur n'est pas le créateur du post et n'est pas admin, on refuse l'accès
                if (post.userId !== req.user.id && req.user.role !== "admin") {
                    return res.status(403).json({ message: "Accès refusé" });
                }
                // suppression du post
                await post.destroy();
                res.status(200).json({ message: "Post supprimé avec succès" });
            } catch (error) {
                console.error(error);
                res.status(500).json({ message: "Erreur serveur" });
            }
        });

        // ----Modification d'un post------
        app.put("/posts/:postId", authenticate, async (req, res) => {
            try {
                const post = await Post.findByPk(req.params.postId);
                if (!post) {
                    return res.status(404).json({ message: "Post non trouvé" });
                }
                // Vérifier que l'utilisateur est le créateur ou admin
                if (post.userId !== req.user.id && req.user.role !== "admin") {
                    return res.status(403).json({ message: "Accès refusé" });
                }
                // Mettre à jour les champs
                if (req.body.title) post.title = req.body.title;
                if (req.body.content) post.content = req.body.content;
                await post.save();
                res.status(200).json({ message: "Post modifié avec succès", post });
            } catch (error) {
                console.error(error);
                res.status(500).json({ message: "Erreur serveur" });
            }
        });


        // ----suppression d'un commentaire
        app.delete("/comments/:commentId", authenticate, async (req, res) => {

            try {

                //  on récupère le commentaire à supprimer 

                const comment = await Comment.findByPk({ where: { id: req.params.commentId } });
                if (!comment) {
                    return res.status().json({ message: "Commentaire non trouvée " })
                } else {
                    //si le user n'est pas le crateur du comment et n'est pas le admin, erreur accées refusé
                    if (comment.userId !== req.user.id && req.user.role !== "admin") {
                        return res.status(404).json({ massage: "Accées non autorisé" })
                    }
                    await comment.destroy();
                    res.status(200).json({ message: "commentaire supprimée avec succées" })
                }
            } catch (error) {
                console.error(error);
                res.status(500).json({ message: "Erreur serveur" })
            }

        })

        // récuperer les posts d'un utilisateur

        app.get("/users/:userId/posts", async (req, res) => {
            try {
                const posts = await Post.findAll({ where: { userId: req.params.userId } });
                if (posts) {
                    res.status(200).json(posts)
                } else {
                    res.status(404).json({ message: "Erreur lors de la récuperation des posts" })
                }
            } catch (error) {

            }
        })

        // Start serveur

        app.listen(process.env.PORT || 3000, () => {
            console.log(`Serveur démarré sur http://localhost:${process.env.PORT || 3000}`);
        });

    } catch (error) {
        console.error("Erreur de chargement Sequelize:", error);
    }
}

main();
