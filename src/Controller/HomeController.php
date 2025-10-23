<?php

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

final class HomeController extends AbstractController
{
    #[Route('/', name: 'home')]
    public function index(): Response
    {
        // Render the Twig template for the home page.
        // Ensure templates/home/index.html.twig exists (see companion file).
        return $this->render('home/index.html.twig');
    }
}
