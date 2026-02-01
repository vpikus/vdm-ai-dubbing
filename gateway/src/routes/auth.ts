import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { verifyPassword, createSession, revokeSession } from '../db/users.js';
import { ulid } from 'ulid';
import { config } from '../config.js';

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// =============================================================================
// ROUTES
// =============================================================================

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // Login
  fastify.post('/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = loginSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: parseResult.error.flatten(),
      });
    }

    const { username, password } = parseResult.data;

    try {
      const user = await verifyPassword(username, password);

      if (!user) {
        return reply.status(401).send({
          error: 'Invalid credentials',
          code: 'UNAUTHORIZED',
        });
      }

      // Generate JWT token
      const jti = ulid();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const token = fastify.jwt.sign(
        {
          sub: user.id,
          username: user.username,
          role: user.role,
          jti,
        },
        {
          expiresIn: config.jwtExpiresIn,
        }
      );

      // Store session
      createSession(jti, user.id, expiresAt);

      return reply.send({
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      });
    } catch (err) {
      fastify.log.error(err, 'Login failed');
      return reply.status(500).send({
        error: 'Login failed',
        code: 'INTERNAL_ERROR',
      });
    }
  });

  // Logout
  fastify.post(
    '/auth/logout',
    {
      preHandler: [fastify.authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const decoded = request.user as { jti: string };

        if (decoded.jti) {
          revokeSession(decoded.jti);
        }

        return reply.status(204).send();
      } catch (err) {
        fastify.log.error(err, 'Logout failed');
        return reply.status(500).send({
          error: 'Logout failed',
          code: 'INTERNAL_ERROR',
        });
      }
    }
  );

  // Get current user
  fastify.get(
    '/auth/me',
    {
      preHandler: [fastify.authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user as {
        sub: number;
        username: string;
        role: string;
      };

      return reply.send({
        id: user.sub,
        username: user.username,
        role: user.role,
      });
    }
  );
}
