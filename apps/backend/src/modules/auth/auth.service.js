export async function login({ email, password }) {
  if (!email || !password) {
    throw new Error("Email and password are required");
  }

  const user = await authRepository.findByEmail(email);

  if (!user) {
    throw new Error("Invalid email or password");
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatch) {
    throw new Error("Invalid email or password");
  }

  const token = createAccessToken(user);

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
    },
  };
}

export async function signup({ email, password }) {
  if (!email || !password) {
    throw new Error("Email and password are required");
  }

  return { email, password };
}
