// database.mjs
import { Sequelize, DataTypes } from "sequelize";
import bcrypt from "bcrypt";
import { defaultValueSchemable } from "sequelize/lib/utils";


export async function loadSequelize() {

    try {
        // connection  a la bdd
        const sequelize = new Sequelize(process.env.DATABASE_URL);
        // authentification
        await sequelize.authenticate();
        console.log("Connexion à la base OK");

        // les models
        const User = sequelize.define("User", {
            username: { type: DataTypes.STRING, allowNull: false },
            email: { type: DataTypes.STRING, allowNull: false },
              role: {
                type: DataTypes.STRING,
                defaultValue: "User"
            },
            password: {
                type: DataTypes.STRING, allowNull: false,

                set(clearPassword) {
                    const hashedPassword = bcrypt.hashSync(clearPassword, 10);
                    this.setDataValue('password', hashedPassword);
                }
            }
           
        });

        const Post = sequelize.define("Post", {
            title: { type: DataTypes.STRING, allowNull: false },
            content: { type: DataTypes.STRING, allowNull: false }
        });

        const Comment = sequelize.define("Comment", {
            content: { type: DataTypes.STRING }
        });

        // RELATIONS
        User.hasMany(Post, { foreignKey: "userId" });
        Post.belongsTo(User, { foreignKey: "userId" });

        User.hasMany(Comment, { foreignKey: "userId" });
        Comment.belongsTo(User, { foreignKey: "userId" });

        Post.hasMany(Comment, { foreignKey: "postId" });
        Comment.belongsTo(Post, { foreignKey: "postId" });


        await sequelize.sync();


        return { sequelize, models: { User, Post, Comment } };

    } catch (error) {
        console.error(error);
        throw new Error("Impossible de se connecter à la base de données");
    }
}
