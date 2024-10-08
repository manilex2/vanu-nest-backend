import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { renderFile } from 'ejs';
import { createTransport, Transporter } from 'nodemailer';
import { genSalt } from 'bcrypt';
import { Usuario } from './auth.interface';
import { sign, verify } from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';

interface ParamsEmail {
  destinatario: string;
  email_destinatario: string;
  vanu_url: string;
  vanu_name: string;
  clave?: string;
}

@Injectable()
export class AuthService {
  constructor(private configService: ConfigService) {}

  db: FirebaseFirestore.Firestore = getFirestore();

  /**
   * Función para cambiar contraseña en Vanu
   * @param {Usuario} usuario parámetros del usuario para cambiar la contreaseña
   * @return {string} Mensaje si la contraseña del usuario fue cambiada exitosamente.
   */
  async changePassword(usuario: Usuario): Promise<string> {
    const auth = getAuth();
    const users = (
      await this.db
        .collection('users')
        .where('email', '==', usuario.email)
        .get()
    ).docs.map((user) => {
      return user.data();
    });

    if (users.length > 0) {
      const user = {
        id: users[0].id,
        email: usuario.email,
        password: `${usuario.clave}`,
      };
      try {
        await auth.updateUser(`${user.id}`, {
          password: `${user.password}`,
        });
        console.log(
          `Contraseña cambiada exitosamente para el usuario: ${user.email}`,
        );
        const usuarioDB = {
          firstLogin: false,
          tokenReset: null,
        };
        await this.db.doc(user.id).update(usuarioDB);
      } catch (error) {
        console.error('Error al cambiar contraseña de usuario:', error);
        throw new HttpException(error, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    } else {
      throw new HttpException(
        'El usuario no se encuentra creado.',
        HttpStatus.NOT_FOUND,
      );
    }
    return 'Usuario creado con éxito';
  }

  /**
   * Función para resetear contraseña de usuario en Vanu
   * @param {Usuario} usuario parámetros del usuario para resetear
   * @return {string} Mensaje si el correo de reseteo de contraseña del usuario fue enviado exitosamente.
   */
  async resetPassword(usuario: Usuario): Promise<string> {
    const users = (
      await this.db
        .collection('users')
        .where('email', '==', usuario.email)
        .get()
    ).docs.map((user) => {
      return user.data();
    });

    if (users.length > 0) {
      const user = {
        id: users[0].id,
        email: usuario.email,
        nombre: users[0].display_name,
      };
      const token = sign(user, this.configService.get<string>('SECRET_JWT'), {
        expiresIn: '1h',
      });
      try {
        const usuarioDB = {
          tokenReset: token,
        };
        await this.db.doc(user.id).update(usuarioDB);
        const send = await this.sendMail(
          {
            destinatario: user.nombre,
            email_destinatario: usuario.email,
            vanu_name: 'Vanu App',
            vanu_url: `https://vanu-coh-az-knifgq.flutterflow.app?email=${user.email}&token=${token}`,
          },
          'resetPassword',
        );
        if (!send) {
          throw new HttpException(
            'Hubo un error al enviar el correo electrónico.',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      } catch (error) {
        throw new HttpException(error, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    } else {
      throw new HttpException(
        'El usuario no se encuentra creado.',
        HttpStatus.NOT_FOUND,
      );
    }
    return `Un correo de confirmación ha sido enviado a su correo electrónico ${usuario.email}.`;
  }

  /**
   * Función para confirmar el reseteo de contraseña de usuario en Vanu
   * @param {Usuario} usuario parámetros del usuario para confirmar resetear
   * @return {string} Mensaje si la contraseña del usuario fue reseteada exitosamente.
   */
  async confirmResetPassword(usuario: Usuario): Promise<string> {
    const clave = await this.claveProv()
      .then((salt) => {
        return salt;
      })
      .catch((error) => {
        console.error(error);
        return error;
      });
    const auth = getAuth();
    const users = (
      await this.db
        .collection('users')
        .where('email', '==', usuario.email)
        .get()
    ).docs.map((user) => {
      return user.data();
    });

    if (users.length > 0) {
      const user = {
        id: users[0].id,
        password: `${clave}`,
        token: users[0].tokenReset,
        nombre: users[0].display_name,
      };
      if (usuario.token != user.token) {
        throw new HttpException(
          'El token de reseteo no coincide',
          HttpStatus.UNAUTHORIZED,
        );
      }
      try {
        verify(user.token, this.configService.get<string>('SECRET_JWT'));
      } catch (err) {
        console.error('Invalid token');
        throw new HttpException(
          'El token de reseteo no es correcto o expiró',
          HttpStatus.UNAUTHORIZED,
        );
      }
      try {
        await auth.updateUser(`${user.id}`, {
          password: `${user.password}`,
        });
        console.log('Contraseña de usuario reseteado con éxito.');
        try {
          const usuarioDB = {
            tokenReset: null,
            firstLogin: true,
          };
          await this.db.doc(user.id).update(usuarioDB);
          const send = await this.sendMail(
            {
              destinatario: user.nombre,
              email_destinatario: usuario.email,
              vanu_name: 'Vanu App',
              vanu_url: 'https://vanu-coh-az-knifgq.flutterflow.app',
              clave: clave,
            },
            'confirmResetPassword',
          );
          if (!send) {
            throw new HttpException(
              'Hubo un error al enviar el correo electrónico.',
              HttpStatus.INTERNAL_SERVER_ERROR,
            );
          }
        } catch (error) {
          throw new HttpException(error, HttpStatus.INTERNAL_SERVER_ERROR);
        }
      } catch (error) {
        console.error('Error al confirmar el reseteo de contraseña:', error);
        throw new HttpException(error, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    } else {
      throw new HttpException(
        'El usuario no se encuentra creado.',
        HttpStatus.NOT_FOUND,
      );
    }
    return `Un correo con su contraseña provisional ha sido enviado a su correo electrónico ${usuario.email}.`;
  }

  /**
   * Función para crear usuario en Vanu
   * @param {Usuario} usuario parámetros del usuario para registrar
   * @return {string} Mensaje si el usuario fue registrado exitosamente.
   */
  async signUp(usuario: Usuario): Promise<string> {
    const clave = await this.claveProv()
      .then((salt) => {
        return salt;
      })
      .catch((error) => {
        console.error(error);
        return error;
      });
    const auth = getAuth();
    const instRef = (
      await this.db.collection('institution').doc(`${usuario.instId}`).get()
    ).ref;
    const users = (
      await this.db
        .collection('users')
        .where('institutionId', '==', instRef)
        .get()
    ).docs.map((user) => {
      return user.data();
    });
    const created = users.some((resp) => resp.email === usuario.email);
    if (!created) {
      const newUserRef = this.db.collection('users').doc();
      const user = {
        email: usuario.email,
        displayName: usuario.display_name,
        password: `${clave}`,
      };
      try {
        const userFirebase = await auth.createUser({
          ...user,
          uid: `${newUserRef.id}`,
        });
        console.log('Usuario creado con éxito:', userFirebase.uid);
        try {
          const usuarioDB = {
            email: usuario.email,
            display_name: usuario.display_name,
            photo_url: !usuario.photo_url ? '' : usuario.photo_url,
            phone_number: usuario.phone_number,
            rol: !usuario.rol ? '' : usuario.rol.toLowerCase(),
            uid: userFirebase.uid,
            created_time: new Date(userFirebase.metadata.creationTime),
            enable: usuario.enable,
            institutionId: instRef,
            firstLogin: true,
            tokenReset: null,
          };
          newUserRef.set(usuarioDB);
          const send = await this.sendMail(
            {
              destinatario: usuario.display_name,
              email_destinatario: usuario.email,
              vanu_name: 'Vanu App',
              vanu_url: 'https://vanu-coh-az-knifgq.flutterflow.app',
              clave: clave,
            },
            'signUp',
          );
          if (!send) {
            throw new HttpException(
              'Hubo un error al enviar el correo electrónico.',
              HttpStatus.INTERNAL_SERVER_ERROR,
            );
          }
        } catch (error) {
          throw new HttpException(error, HttpStatus.INTERNAL_SERVER_ERROR);
        }
      } catch (error) {
        console.error('Error al crear usuario:', error);
        throw new HttpException(error, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    } else {
      throw new HttpException(
        'El usuario ya se encuentra creado.',
        HttpStatus.CONFLICT,
      );
    }
    return 'Usuario creado con éxito';
  }

  /**
   * Envio por correo sobre los diferentes procesos de auth del usuario.
   * @param {ParamsEmail} params -
   * Lista de parametros necesarios para crear el template del correo.
   * @param {string} proceso Proceso del usuario del que se va a enviar email
   * @return {boolean} - True si se envío correctamento el correo.
   */
  async sendMail(params: ParamsEmail, proceso: string): Promise<boolean> {
    let hasSendedEmail: boolean = false;
    // create reusable transporter object using the default SMTP transport
    const transporter: Transporter = createTransport({
      host: this.configService.get<string>('MAIL_HOST'),
      secure: true, // true for 465, false for other ports
      auth: {
        user: this.configService.get<string>('MAIL_USER'), // generated ethereal user
        pass: this.configService.get<string>('MAIL_PASS'), // generated ethereal password
      },
    });
    const contextMail: object =
      proceso == 'signUp'
        ? {
            banner: this.configService.get<string>('VANU_BANNER_MAIL'),
            app: params.vanu_name,
            link: params.vanu_url,
            nombre: params.destinatario,
            email: params.email_destinatario,
            clave: params.clave,
          }
        : proceso == 'confirmResetPassword'
          ? {
              banner: this.configService.get<string>('VANU_BANNER_MAIL'),
              app: params.vanu_name,
              link: params.vanu_url,
              nombre: params.destinatario,
              clave: params.clave,
            }
          : {
              banner: this.configService.get<string>('VANU_BANNER_MAIL'),
              app: params.vanu_name,
              link: params.vanu_url,
              nombre: params.destinatario,
            };
    const html: string =
      proceso == 'signUp'
        ? await renderFile(
            './views/mail_register_user_template.ejs',
            contextMail,
          )
        : proceso == 'confirmResetPassword'
          ? await renderFile(
              './views/mail_confirm_reset_pass_template.ejs',
              contextMail,
            )
          : await renderFile(
              './views/mail_reset_pass_template.ejs',
              contextMail,
            );

    // send mail with defined transport object
    await transporter
      .sendMail({
        from: `"Vanu" <${this.configService.get<string>('MAIL_SENDER')}>`,
        to: `"${params.destinatario}" <${params.email_destinatario}>`,
        subject:
          proceso == 'signUp'
            ? 'Registro de Usuario'
            : proceso == 'confirmResetPassword'
              ? 'Confirmar Reseteo de Contraseña'
              : 'Reseteo de Contraseña',
        html: html,
      })
      .then((res: { accepted: string | any[] }) => {
        if (res.accepted.length == 1) {
          hasSendedEmail = true;
          console.log('Correo enviado éxitosamente');
        }
      })
      .catch((err: any) => {
        console.error('Error al enviar correo');
        console.error(err);
      });
    return hasSendedEmail;
  }

  /**
   * Crear una cadena de caracteres aleatoria.
   * @return {string} La cadena aleatoria de caracteres.
   */
  claveProv(): Promise<string> {
    const saltRounds = 10;
    return new Promise((resolve, reject) => {
      genSalt(saltRounds, (err, salt) => {
        if (err) {
          reject(err);
        } else {
          resolve(salt);
        }
      });
    });
  }
}
