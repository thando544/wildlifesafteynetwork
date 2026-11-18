export default async function login(req, res, next) {
  try {
    const result = await authService.login(req.body);

    res.status(200).json({
      message: "Login successful",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export default async function signUp(req, res, next){
    try {
        const result =  await authService.signUp(req.body);

        res.status(201).json({
            message: "Account has been created successfully",
            data: result,
        });
    } catch (error){
        next(error);
    }
}
