import {
  findAccountByProvider,
  findUserByEmail,
  findUserById,
  createUser,
  updateUser,
  linkAccount,
} from "../db.js";

/**
 * Find or create user from OAuth profile.
 * 1. Check if account with this provider+providerAccountId exists -> return that user
 * 2. If not, check if a user with this email exists -> link account to that user
 * 3. If neither, create new user + new account link
 */
export async function findOrCreateUser(oauthProfile) {
  const {
    provider,
    email,
    name,
    avatarUrl,
  } = oauthProfile;

  // Coerce types for libsql compatibility
  const providerAccountId = String(oauthProfile.providerAccountId);
  const accessToken = oauthProfile.accessToken || null;
  const refreshToken = oauthProfile.refreshToken || null;

  // 1. Check existing account link
  const existingAccount = await findAccountByProvider(
    provider,
    providerAccountId,
  );
  if (existingAccount) {
    const user = await findUserById(existingAccount.user_id);
    if (user && (user.name !== name || user.avatar_url !== avatarUrl)) {
      await updateUser(user.id, {
        name: name || user.name,
        avatarUrl: avatarUrl || user.avatar_url,
      });
    }
    return {
      ...user,
      name: name || user.name,
      avatar_url: avatarUrl || user.avatar_url,
    };
  }

  // 2. Check email match (link to existing user)
  let user = null;
  if (email) {
    user = await findUserByEmail(email);
  }

  // 3. Create new user if no match
  if (!user) {
    const userId = await createUser(email, name, avatarUrl);
    user = { id: userId, email, name, avatar_url: avatarUrl };
  }

  // Link this OAuth account to the user
  await linkAccount(
    user.id,
    provider,
    providerAccountId,
    accessToken,
    refreshToken,
  );

  return user;
}
