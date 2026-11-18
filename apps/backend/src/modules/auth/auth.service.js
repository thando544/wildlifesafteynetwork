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


export async function signUp({ email, username, password }) {
  if (!email || !username || !password) {
    throw new Error("Email, username and password are required");
  }

  const existingUser = await authRepository.findByEmailOrUsername(
    email,
    username,
  );

  if (existingUser) {
    throw new Error("An account with that email or username already exists");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await authRepository.create({
    email,
    username,
    passwordHash,
  });

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
